use crate::{models::Backup, settings::Storage};
use chrono::NaiveDateTime;
use futures::TryStreamExt;
use object_store::{
    ObjectStore, ObjectStoreExt, azure::MicrosoftAzureBuilder, buffered::BufWriter,
    path::Path as ObjectPath,
};
use std::{path::Path, sync::Arc};
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
pub struct StorageService(pub Arc<dyn ObjectStore>);

impl StorageService {
    pub fn new(settings: &Storage) -> anyhow::Result<Self> {
        let mut builder =
            MicrosoftAzureBuilder::from_env().with_container_name(&settings.container);
        if !settings.connection_string.is_empty() {
            let values: std::collections::HashMap<_, _> = settings
                .connection_string
                .split(';')
                .filter_map(|part| part.split_once('='))
                .collect();
            let account = values
                .get("AccountName")
                .ok_or_else(|| anyhow::anyhow!("Missing storage account"))?;
            let key = values
                .get("AccountKey")
                .ok_or_else(|| anyhow::anyhow!("Missing storage key"))?;
            let endpoint = values
                .get("BlobEndpoint")
                .ok_or_else(|| anyhow::anyhow!("Missing blob endpoint"))?;
            let url = url::Url::parse(endpoint)?;
            let emulator = matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
            builder = builder
                .with_account(*account)
                .with_access_key(*key)
                // The connection string already includes Azurite's account path.
                // Emulator mode ignores custom endpoints in object_store.
                .with_use_emulator(false)
                .with_allow_http(emulator)
                .with_endpoint(endpoint.trim_end_matches('/').to_string());
        } else {
            let endpoint = url::Url::parse(&settings.endpoint)?;
            anyhow::ensure!(
                endpoint.scheme() == "https",
                "Storage endpoint must use HTTPS"
            );
            let account = endpoint
                .host_str()
                .and_then(|h| h.split('.').next())
                .ok_or_else(|| anyhow::anyhow!("Invalid storage endpoint"))?;
            builder = builder
                .with_account(account)
                .with_endpoint(settings.endpoint.clone());
        }
        Ok(Self(Arc::new(builder.build()?)))
    }

    pub async fn list(&self, prefix: &str) -> anyhow::Result<Vec<Backup>> {
        let prefix = ObjectPath::from(prefix);
        let mut objects = self.0.list(Some(&prefix));
        let mut backups = Vec::new();
        while let Some(item) = objects.try_next().await? {
            let name = item.location.filename().unwrap_or_default();
            if !name.ends_with(".zip") {
                continue;
            }
            let parts: Vec<_> = name.split('.').collect();
            anyhow::ensure!(parts.len() == 6, "Invalid backup metadata: {name}");
            backups.push(Backup {
                name: name.into(),
                last_modified: NaiveDateTime::parse_from_str(parts[0], "%Y%m%d-%H%M%S")?.and_utc(),
                size: item.size,
                total_row_count: parts[1].parse()?,
                file_count: parts[2].parse()?,
                files_total_size: parts[3].parse()?,
                retention_period: parts[4].parse()?,
                has_plain_dump: true,
            });
        }
        backups.sort_by_key(|backup| std::cmp::Reverse(backup.last_modified));
        Ok(backups)
    }

    pub fn path(prefix: &str, key: &str) -> ObjectPath {
        ObjectPath::from(format!("{prefix}/{key}"))
    }

    pub async fn upload(&self, prefix: &str, key: &str, file: &Path) -> anyhow::Result<()> {
        let mut writer = BufWriter::new(self.0.clone(), Self::path(prefix, key));
        let result = async {
            tokio::io::copy(&mut tokio::fs::File::open(file).await?, &mut writer).await?;
            writer.shutdown().await
        }
        .await;
        if result.is_err() {
            let _ = writer.abort().await;
        }
        Ok(result?)
    }

    pub async fn download(&self, prefix: &str, key: &str, output: &Path) -> anyhow::Result<()> {
        let mut stream = self.0.get(&Self::path(prefix, key)).await?.into_stream();
        let mut file = tokio::fs::File::create(output).await?;
        while let Some(bytes) = stream.try_next().await? {
            file.write_all(&bytes).await?;
        }
        file.flush().await?;
        Ok(())
    }

    pub async fn delete(&self, prefix: &str, key: &str) -> anyhow::Result<()> {
        self.0.delete(&Self::path(prefix, key)).await?;
        Ok(())
    }
}

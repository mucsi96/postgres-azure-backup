use serde::{Deserialize, Serialize};

#[derive(Clone, Deserialize, Serialize)]
pub struct Settings {
    pub oidc: Oidc,
    pub storage: Storage,
    pub databases_path: String,
    #[serde(default)]
    pub databases: Vec<Database>,
    pub schedule_enabled: bool,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Oidc {
    pub issuer: String,
    pub audience: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Storage {
    pub endpoint: String,
    pub container: String,
    pub connection_string: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Database {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub schema: String,
    pub username: String,
    pub password: String,
    #[serde(default, deserialize_with = "null_default")]
    pub exclude_tables: Vec<String>,
    #[serde(default, deserialize_with = "null_default")]
    pub folder_backups: Vec<Folder>,
}

fn null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Folder {
    pub path: String,
}

impl Database {
    pub fn prefix(&self) -> String {
        self.name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect()
    }
}

impl Settings {
    pub fn validate(&self) -> anyhow::Result<()> {
        crate::middleware::auth::validate_endpoint(&self.oidc.issuer)?;
        anyhow::ensure!(!self.oidc.audience.is_empty(), "API audience is required");
        anyhow::ensure!(
            !self.storage.container.is_empty(),
            "Storage container is required"
        );
        let mut prefixes = std::collections::HashSet::new();
        for db in &self.databases {
            anyhow::ensure!(
                !db.name.is_empty()
                    && !db.schema.is_empty()
                    && !db.host.is_empty()
                    && !db.database.is_empty()
                    && !db.username.is_empty()
                    && db.port != 0,
                "Invalid database configuration"
            );
            anyhow::ensure!(
                prefixes.insert(db.prefix()),
                "Database prefixes must be unique"
            );
            let mut folders = std::collections::HashSet::new();
            for folder in &db.folder_backups {
                let path = std::path::Path::new(&folder.path);
                anyhow::ensure!(
                    path.is_absolute()
                        && path.file_name().is_some()
                        && folders.insert(path.file_name()),
                    "Folder paths must be absolute with unique basenames"
                );
            }
        }
        Ok(())
    }
}

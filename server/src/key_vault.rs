use crate::settings::Settings;
use anyhow::Context;
use azure_identity::WorkloadIdentityCredential;
use azure_security_keyvault_secrets::SecretClient;

pub async fn configure(settings: &mut Settings) -> anyhow::Result<()> {
    let endpoint =
        std::env::var("AZURE_KEYVAULT_ENDPOINT").context("AZURE_KEYVAULT_ENDPOINT is required")?;
    let client = SecretClient::new(&endpoint, WorkloadIdentityCredential::new(None)?, None)?;
    settings.oidc.issuer = format!(
        "https://login.microsoftonline.com/{}/v2.0",
        secret(&client, "tenant-id").await?
    );
    settings.oidc.audience = secret(&client, "api-client-id").await?;
    settings.storage.endpoint = secret(&client, "storage-account-blob-url").await?;
    settings.storage.container = secret(&client, "storage-account-container-name").await?;
    settings.databases = serde_json::from_str(&secret(&client, "dbs-config").await?)?;
    Ok(())
}

async fn secret(client: &SecretClient, name: &str) -> anyhow::Result<String> {
    let value = client
        .get_secret(name, None)
        .await?
        .into_model()?
        .value
        .with_context(|| format!("Key Vault secret {name} is empty"))?;
    anyhow::ensure!(!value.trim().is_empty(), "Key Vault secret {name} is empty");
    Ok(value)
}

package io.github.mucsi96.postgresbackuptool.utils;

import com.azure.identity.DefaultAzureCredential;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import com.azure.security.keyvault.secrets.models.KeyVaultSecret;

public class KeyVaultUtils {
    public static SecretClient getSecretClient() {
        DefaultAzureCredential credential = new DefaultAzureCredentialBuilder()
                .build();
        return new SecretClientBuilder()
                .vaultUrl("https://p06-backup.vault.azure.net/").credential(credential)
                .buildClient();
    }

    public static String getSecretValue(SecretClient secretClient, String secretName) {
        KeyVaultSecret secret = secretClient.getSecret(secretName);
        return secret.getValue();
    }
}

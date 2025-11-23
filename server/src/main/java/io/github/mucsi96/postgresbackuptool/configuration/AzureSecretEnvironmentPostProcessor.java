package io.github.mucsi96.postgresbackuptool.configuration;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import com.azure.identity.DefaultAzureCredential;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import com.azure.security.keyvault.secrets.models.KeyVaultSecret;

@Order(Ordered.HIGHEST_PRECEDENCE)
public class AzureSecretEnvironmentPostProcessor
        implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment,
            SpringApplication application) {
        String activeProfile = environment
                .getProperty("spring.profiles.active");
        if (!"local".equals(activeProfile) && !"prod".equals(activeProfile)) {
            return;
        }

        DefaultAzureCredential credential = new DefaultAzureCredentialBuilder()
                .build();
        SecretClient secretClient = new SecretClientBuilder()
                .vaultUrl("https://p06.vault.azure.net/").credential(credential)
                .buildClient();

        Map<String, Object> properties = new LinkedHashMap<>();

        if ("local".equals(activeProfile)) {
            properties.put("AZURE_TENANT_ID",
                    getSecretValue(secretClient, "tenant-id"));
            properties.put("AZURE_CLIENT_ID",
                    getSecretValue(secretClient, "backup-api-client-id"));
            properties.put("AZURE_CLIENT_SECRET",
                    getSecretValue(secretClient, "backup-api-client-secret"));
        }

        properties.put("STORAGE_ACCOUNT_BLOB_URL",
                "https://ibari.blob.core.windows.net/");
        properties.put("STORAGE_ACCOUNT_CONTAINER_NAME", "backups");
        properties.put("UI_CLIENT_ID",
                getSecretValue(secretClient, "backup-spa-client-id"));

        environment.getPropertySources()
                .addFirst(new MapPropertySource("myProps", properties));
    }

    private String getSecretValue(SecretClient secretClient,
            String secretName) {
        KeyVaultSecret secret = secretClient.getSecret(secretName);
        return secret.getValue();
    }
}

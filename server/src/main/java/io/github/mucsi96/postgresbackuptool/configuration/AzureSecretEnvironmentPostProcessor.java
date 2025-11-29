package io.github.mucsi96.postgresbackuptool.configuration;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import com.azure.security.keyvault.secrets.SecretClient;

import io.github.mucsi96.postgresbackuptool.utils.KeyVaultUtils;

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

        SecretClient secretClient = KeyVaultUtils.getSecretClient();

        Map<String, Object> properties = new LinkedHashMap<>();

        if ("local".equals(activeProfile)) {
            properties.put("AZURE_TENANT_ID",
                    KeyVaultUtils.getSecretValue(secretClient, "tenant-id"));
            properties.put("AZURE_CLIENT_ID", KeyVaultUtils
                    .getSecretValue(secretClient, "api-client-id"));
            properties.put("AZURE_CLIENT_SECRET", KeyVaultUtils
                    .getSecretValue(secretClient, "api-client-secret"));
        }

        properties.put("STORAGE_ACCOUNT_BLOB_URL", KeyVaultUtils
                .getSecretValue(secretClient, "storage-account-blob-url"));
        properties.put("STORAGE_ACCOUNT_CONTAINER_NAME",
                KeyVaultUtils.getSecretValue(secretClient,
                        "storage-account-container-name"));
        properties.put("UI_CLIENT_ID",
                KeyVaultUtils.getSecretValue(secretClient, "spa-client-id"));

        environment.getPropertySources()
                .addFirst(new MapPropertySource("myProps", properties));
    }
}

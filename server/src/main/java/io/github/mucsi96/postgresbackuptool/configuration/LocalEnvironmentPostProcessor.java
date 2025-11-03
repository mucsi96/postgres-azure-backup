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
public class LocalEnvironmentPostProcessor implements EnvironmentPostProcessor {

  @Override
  public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
    if (!"local".equals(environment.getProperty("spring.profiles.active"))) {
      return;
    }

    DefaultAzureCredential credential = new DefaultAzureCredentialBuilder().build();
    SecretClient secretClient = new SecretClientBuilder()
        .vaultUrl("https://p06.vault.azure.net/")
        .credential(credential)
        .buildClient();

    Map<String, Object> properties = new LinkedHashMap<>();

    properties.put("SPRING_ACTUATOR_PORT", "8082");
    properties.put("AZURE_TENANT_ID", getSecretValue(secretClient, "tenant-id"));
    properties.put("AZURE_CLIENT_ID", getSecretValue(secretClient, "backup-api-client-id"));
    properties.put("AZURE_CLIENT_SECRET", getSecretValue(secretClient, "backup-api-client-secret"));
    properties.put("UI_CLIENT_ID", getSecretValue(secretClient, "backup-spa-client-id"));
    properties.put("STORAGE_ACCOUNT_BLOB_URL", "https://ibari.blob.core.windows.net/");
    properties.put("STORAGE_ACCOUNT_CONTAINER_NAME", "backups");
    properties.put("DATABASES_CONFIG_PATH", "../scripts/databases_config.json");

    environment.getPropertySources().addFirst(new MapPropertySource("myProps", properties));
  }

  private String getSecretValue(SecretClient secretClient, String secretName) {
    KeyVaultSecret secret = secretClient.getSecret(secretName);
    return secret.getValue();
  }
}

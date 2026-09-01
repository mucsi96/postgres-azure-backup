package io.github.mucsi96.postgresbackuptool.configuration;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.azure.core.credential.TokenCredential;
import com.azure.identity.ClientSecretCredentialBuilder;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClientBuilder;

@Configuration
public class StorageConfiguration {

  // The blob container client is created explicitly instead of relying on
  // Spring Cloud Azure auto-configuration: the auto-configured beans are
  // guarded by property conditions that GraalVM native images evaluate during
  // AOT processing (when no connection properties are set), so they would be
  // missing from the native image. All properties are resolved at runtime.
  @Bean
  BlobContainerClient blobContainerClient(
      @Value("${spring.cloud.azure.storage.blob.endpoint:}") String endpoint,
      @Value("${spring.cloud.azure.storage.blob.connection-string:}") String connectionString,
      @Value("${spring.cloud.azure.storage.blob.credential.client-id:}") String clientId,
      @Value("${spring.cloud.azure.storage.blob.credential.client-secret:}") String clientSecret,
      @Value("${tenant-id:}") String tenantId,
      @Value("${spring.cloud.azure.storage.blob.container-name}") String containerName) {
    BlobServiceClientBuilder builder = new BlobServiceClientBuilder();

    if (!connectionString.isBlank()) {
      builder.connectionString(connectionString);
    } else {
      builder.endpoint(endpoint).credential(createCredential(clientId,
          clientSecret, tenantId));
    }

    return builder.buildClient().getBlobContainerClient(containerName);
  }

  private TokenCredential createCredential(String clientId, String clientSecret,
      String tenantId) {
    if (!clientSecret.isBlank()) {
      return new ClientSecretCredentialBuilder().tenantId(tenantId)
          .clientId(clientId).clientSecret(clientSecret).build();
    }

    return new DefaultAzureCredentialBuilder()
        .managedIdentityClientId(clientId).workloadIdentityClientId(clientId)
        .build();
  }

  @Bean
  DateTimeFormatter backupDateTimeFormat() {
    return DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
        .withZone(ZoneOffset.UTC);
  }
}

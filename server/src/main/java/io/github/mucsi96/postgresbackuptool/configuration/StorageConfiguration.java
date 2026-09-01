package io.github.mucsi96.postgresbackuptool.configuration;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.aot.hint.TypeReference;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

import com.azure.core.credential.TokenCredential;
import com.azure.identity.ClientSecretCredentialBuilder;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClientBuilder;

@Configuration
@ImportRuntimeHints(StorageConfiguration.AzureBlobRuntimeHints.class)
public class StorageConfiguration {

  // The Azure SDK builds storage exceptions reflectively
  // (ResponseExceptionConstructorCache); without constructor hints, error
  // responses fail with NoSuchMethodException in the native image instead of
  // surfacing as BlobStorageException.
  static class AzureBlobRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      hints.reflection().registerType(
          TypeReference.of(
              "com.azure.storage.blob.implementation.models.BlobStorageExceptionInternal"),
          MemberCategory.INVOKE_DECLARED_CONSTRUCTORS);
      hints.reflection().registerType(
          TypeReference.of("com.azure.storage.blob.models.BlobStorageException"),
          MemberCategory.INVOKE_DECLARED_CONSTRUCTORS);
    }
  }

  // The blob container client is created explicitly instead of relying on
  // Spring Cloud Azure auto-configuration: the auto-configured beans are
  // guarded by property conditions that GraalVM native images evaluate during
  // AOT processing (when no connection properties are set), so they would be
  // missing from the native image. All properties are resolved at runtime.
  // The credential precedence is tied to what the profiles set: test sets
  // connection-string, local sets client-id + client-secret, prod sets
  // client-id only (workload/managed identity). Because auto-configuration
  // no longer applies, SDK tuning (retry policy, proxy, telemetry) must be
  // configured on this builder manually.
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
      if (endpoint.isBlank() || clientId.isBlank()) {
        throw new IllegalStateException(
            "Blob storage is misconfigured: set either "
                + "spring.cloud.azure.storage.blob.connection-string or both "
                + "spring.cloud.azure.storage.blob.endpoint and "
                + "spring.cloud.azure.storage.blob.credential.client-id");
      }

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

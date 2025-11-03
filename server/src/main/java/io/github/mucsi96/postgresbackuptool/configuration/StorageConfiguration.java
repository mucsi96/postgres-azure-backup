package io.github.mucsi96.postgresbackuptool.configuration;

import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.azure.core.credential.TokenCredential;
import com.azure.identity.ClientSecretCredentialBuilder;
import com.azure.identity.WorkloadIdentityCredentialBuilder;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;

import lombok.extern.slf4j.Slf4j;

@Configuration
@Slf4j
public class StorageConfiguration {
  @Value("${blobstorage.accountUrl}")
  private String accountUrl;

  @Profile("test")
  @Bean
  BlobServiceClient testBlobServiceClient(
      @Value("${blobstorage.connectionString}") String connectionString)
      throws Exception {

    return new BlobServiceClientBuilder().connectionString(connectionString)
        .buildClient();
  }

  @Profile("prod")
  @Bean
  BlobServiceClient prodBlobServiceClient(
      @Value("${blobstorage.clientId}") String clientId,
      @Value("${blobstorage.tenantId}") String tenantId) throws Exception {

    TokenCredential tokenCredential = new WorkloadIdentityCredentialBuilder()
        .clientId(clientId)
        .tenantId(tenantId)
        .build();

    BlobServiceClient blobServiceClient = new BlobServiceClientBuilder()
        .endpoint(accountUrl).credential(tokenCredential).buildClient();

    return blobServiceClient;
  }

  @Profile("local")
  @Bean
  BlobServiceClient localBlobServiceClient(
      @Value("${blobstorage.clientId}") String clientId,
      @Value("${blobstorage.tenantId}") String tenantId,
      @Value("${blobstorage.clientSecret}") String clientSecret)
      throws Exception {

    TokenCredential tokenCredential = new ClientSecretCredentialBuilder()
        .clientId(clientId)
        .tenantId(tenantId)
        .clientSecret(clientSecret)
        .build();

    BlobServiceClient blobServiceClient = new BlobServiceClientBuilder()
        .endpoint(accountUrl).credential(tokenCredential).buildClient();

    return blobServiceClient;
  }

  @Bean
  DateTimeFormatter backupDateTimeFormat() {
    return DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
        .withZone(ZoneOffset.UTC);
  }
}

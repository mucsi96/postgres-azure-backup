package io.github.mucsi96.postgresbackuptool.configuration;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.security.keyvault.secrets.SecretClient;
import com.azure.security.keyvault.secrets.SecretClientBuilder;
import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class DatabaseConfigurationProviderConfig {

    @Bean
    @Profile({ "prod", "local" })
    SecretClient databaseConfigSecretClient(
            @Value("${keyvault-endpoint}") String keyvaultEndpoint) {
        return new SecretClientBuilder().vaultUrl(keyvaultEndpoint)
                .credential(new DefaultAzureCredentialBuilder().build())
                .buildClient();
    }

    @Bean
    @Profile("prod")
    DatabaseConfigurationProvider prodDatabaseConfigurationProvider(
            SecretClient databaseConfigSecretClient,
            @Value("${databases-config-secret-name}") String secretName,
            ObjectMapper objectMapper) {
        return () -> readFromKeyVault(databaseConfigSecretClient, secretName,
                objectMapper);
    }

    @Bean
    @Profile("local")
    DatabaseConfigurationProvider localDatabaseConfigurationProvider(
            SecretClient databaseConfigSecretClient,
            @Value("${databases-config-secret-name}") String secretName,
            ObjectMapper objectMapper) {
        return () -> {
            List<DatabaseConfiguration> databases = readFromKeyVault(
                    databaseConfigSecretClient, secretName, objectMapper);
            // Adjust host to localhost for local development
            databases.forEach(db -> {
                db.setHost("localhost");
                db.setPort(5461);
            });
            return databases;
        };
    }

    @Bean
    @Profile("test")
    DatabaseConfigurationProvider testDatabaseConfigurationProvider(
            @Value("${databasesConfigPath}") String databasesConfigPath,
            ObjectMapper objectMapper) {
        return () -> {
            try {
                return Arrays.asList(
                        objectMapper.readValue(Paths.get(databasesConfigPath)
                                .toFile(), DatabaseConfiguration[].class));
            } catch (IOException e) {
                throw new RuntimeException(
                        "Failed to read database configurations from "
                                + databasesConfigPath,
                        e);
            }
        };
    }

    private static List<DatabaseConfiguration> readFromKeyVault(
            SecretClient secretClient, String secretName,
            ObjectMapper objectMapper) {
        String json = secretClient.getSecret(secretName).getValue();
        try {
            return Arrays.asList(objectMapper.readValue(json,
                    DatabaseConfiguration[].class));
        } catch (IOException e) {
            throw new RuntimeException(
                    "Failed to parse database configurations from secret "
                            + secretName,
                    e);
        }
    }
}

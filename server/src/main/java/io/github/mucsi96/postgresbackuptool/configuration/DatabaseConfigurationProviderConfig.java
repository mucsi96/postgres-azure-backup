package io.github.mucsi96.postgresbackuptool.configuration;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.fasterxml.jackson.databind.ObjectMapper;

@Configuration
public class DatabaseConfigurationProviderConfig {

    @Value("${dbs-config:}")
    String databasesConfig;

    @Bean
    @Profile("prod")
    DatabaseConfigurationProvider prodDatabaseConfigurationProvider(
            ObjectMapper objectMapper) throws IOException {
        List<DatabaseConfiguration> databases = Arrays.asList(objectMapper
                .readValue(databasesConfig, DatabaseConfiguration[].class));
        return () -> databases;
    }

    @Bean
    @Profile("local")
    DatabaseConfigurationProvider localDatabaseConfigurationProvider(
            ObjectMapper objectMapper) throws IOException {
        List<DatabaseConfiguration> databases = Arrays.asList(objectMapper
                .readValue(databasesConfig, DatabaseConfiguration[].class));
        // Adjust host to localhost for local development
        databases.forEach(db -> {
            db.setHost("localhost");
            db.setPort(5461);
        });
        return () -> databases;
    }

    @Bean
    @Profile("test")
    DatabaseConfigurationProvider testDatabaseConfigurationProvider(
            @Value("${databasesConfigPath}") String databasesConfigPath,
            ObjectMapper objectMapper) throws IOException {
        List<DatabaseConfiguration> databases = Arrays.asList(
                objectMapper.readValue(Paths.get(databasesConfigPath).toFile(),
                        DatabaseConfiguration[].class));
        return () -> databases;
    }
}

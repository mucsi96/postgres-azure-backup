package io.github.mucsi96.postgresbackuptool.configuration;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.mucsi96.postgresbackuptool.model.DumpFormat;
import io.github.mucsi96.postgresbackuptool.model.FolderBackupConfig;

// The @Profile conditions are evaluated during AOT processing for the GraalVM
// native image build, so every profile needs its own image: the Dockerfile
// runs AOT with the target profile active (SPRING_PROFILES_ACTIVE build arg)
// and only that profile's bean ends up in the native image.
@Configuration
@RegisterReflectionForBinding({ DatabaseConfiguration.class,
    FolderBackupConfig.class, DumpFormat.class })
public class DatabaseConfigurationProviderConfig {

    @Value("${dbs-config:}")
    String databasesConfig;

    @Bean
    @Profile("prod")
    DatabaseConfigurationProvider prodDatabaseConfigurationProvider(
            ObjectMapper objectMapper) throws IOException {
        List<DatabaseConfiguration> databases = parseDatabasesConfig(
                objectMapper);
        return () -> databases;
    }

    @Bean
    @Profile("local")
    DatabaseConfigurationProvider localDatabaseConfigurationProvider(
            ObjectMapper objectMapper) throws IOException {
        List<DatabaseConfiguration> databases = parseDatabasesConfig(
                objectMapper);
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

    private List<DatabaseConfiguration> parseDatabasesConfig(
            ObjectMapper objectMapper) throws IOException {
        if (databasesConfig.isBlank()) {
            throw new IllegalStateException("dbs-config is required");
        }

        return Arrays.asList(objectMapper.readValue(databasesConfig,
                DatabaseConfiguration[].class));
    }
}

package io.github.mucsi96.postgresbackuptool.configuration;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;

import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.mucsi96.postgresbackuptool.model.DumpFormat;
import io.github.mucsi96.postgresbackuptool.model.FolderBackupConfig;

@Configuration
@RegisterReflectionForBinding({ DatabaseConfiguration.class,
    FolderBackupConfig.class, DumpFormat.class })
public class DatabaseConfigurationProviderConfig {

    @Value("${dbs-config:}")
    String databasesConfig;

    @Value("${databasesConfigPath:}")
    String databasesConfigPath;

    // Profile-specific behavior is decided at runtime instead of with
    // @Profile-conditional beans: GraalVM native images evaluate bean
    // conditions during AOT processing, so profile-guarded beans would be
    // missing from the native image.
    @Bean
    DatabaseConfigurationProvider databaseConfigurationProvider(
            Environment environment, ObjectMapper objectMapper)
            throws IOException {
        List<DatabaseConfiguration> databases;

        if (environment.matchesProfiles("test")) {
            databases = Arrays.asList(objectMapper.readValue(
                    Paths.get(databasesConfigPath).toFile(),
                    DatabaseConfiguration[].class));
        } else {
            databases = Arrays.asList(objectMapper.readValue(databasesConfig,
                    DatabaseConfiguration[].class));

            if (environment.matchesProfiles("local")) {
                // Adjust host to localhost for local development
                databases.forEach(db -> {
                    db.setHost("localhost");
                    db.setPort(5461);
                });
            }
        }

        return () -> databases;
    }
}

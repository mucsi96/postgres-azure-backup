package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.time.format.DateTimeFormatter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import lombok.RequiredArgsConstructor;

/**
 * Service responsible for orchestrating backup and cleanup operations.
 * This service is used by both the REST controller and the scheduled tasks.
 */
@Service
@RequiredArgsConstructor
public class BackupOrchestrationService {
    private static final Logger logger = LoggerFactory.getLogger(BackupOrchestrationService.class);

    private final BackupService backupService;
    private final DatabaseService databaseService;
    private final DateTimeFormatter dateTimeFormatter;

    /**
     * Performs backup for all configured databases with the specified retention period.
     *
     * @param retentionPeriod Number of days to retain the backup
     * @throws IOException If an I/O error occurs
     * @throws InterruptedException If the backup process is interrupted
     */
    public void performBackup(int retentionPeriod) throws IOException, InterruptedException {
        String timeString = dateTimeFormatter.format(Instant.now());

        for (DatabaseConfiguration databaseConfiguration : databaseService.getDatabases()) {
            try {
                logger.info("Creating backup for database: {} with retention: {} days",
                        databaseConfiguration.getName(), retentionPeriod);

                // Create main dump
                createDump(retentionPeriod, databaseConfiguration.getName(),
                        databaseConfiguration.getPrefix(),
                        databaseConfiguration.getDumpFormat().getValue(),
                        timeString);

                // Create plain dump if configured
                if (databaseConfiguration.isCreatePlainDump()) {
                    createDump(retentionPeriod, databaseConfiguration.getName(),
                            databaseConfiguration.getPrefix(), "plain",
                            timeString);
                }

                logger.info("Backup completed for database: {}", databaseConfiguration.getName());
            } catch (IOException | InterruptedException e) {
                logger.error("Failed to backup database: {}", databaseConfiguration.getName(), e);
                throw new RuntimeException("Failed to backup database: " + databaseConfiguration.getName(), e);
            }
        }
    }

    /**
     * Performs cleanup of expired backups for all configured databases.
     */
    public void performCleanup() {
        logger.info("Starting backup cleanup");

        databaseService.getDatabases().stream()
                .map(DatabaseConfiguration::getPrefix)
                .forEach(prefix -> {
                    logger.info("Cleaning up backups for prefix: {}", prefix);
                    backupService.cleanup(prefix);
                });

        logger.info("Backup cleanup completed");
    }

    private void createDump(int retentionPeriod, String name, String prefix,
            String dumpFormat, String timeString) throws IOException, InterruptedException {
        File dumpFile = null;
        try {
            dumpFile = databaseService.createDump(name, retentionPeriod, dumpFormat, timeString);
            backupService.createBackup(prefix, dumpFile);
        } finally {
            if (dumpFile != null && dumpFile.exists()) {
                boolean deleted = dumpFile.delete();
                if (!deleted) {
                    logger.warn("Failed to delete temporary dump file: {}", dumpFile.getAbsolutePath());
                }
            }
        }
    }
}

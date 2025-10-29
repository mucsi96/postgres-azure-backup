package io.github.mucsi96.postgresbackuptool.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.model.Backup;
import lombok.RequiredArgsConstructor;

/**
 * Service responsible for intelligent backup management.
 * Analyzes existing backups and determines what backup operations are needed
 * based on retention periods and time since last backup.
 */
@Service
@RequiredArgsConstructor
public class SmartBackupService {
    private static final Logger logger = LoggerFactory.getLogger(SmartBackupService.class);

    private final BackupOrchestrationService backupOrchestrationService;
    private final BackupService backupService;
    private final DatabaseService databaseService;

    // Define retention periods and their backup intervals
    private static final int DAILY_RETENTION = 7;
    private static final int WEEKLY_RETENTION = 30;
    private static final int MONTHLY_RETENTION = 356;

    private static final Duration DAILY_INTERVAL = Duration.ofDays(1);
    private static final Duration WEEKLY_INTERVAL = Duration.ofDays(7);
    private static final Duration MONTHLY_INTERVAL = Duration.ofDays(30);

    /**
     * Analyzes backup history and performs necessary backup and cleanup operations.
     * This method determines which retention period backups are needed based on
     * the time elapsed since the last backup of each type.
     *
     * @return Summary of operations performed
     */
    public SmartBackupResult performSmartBackup() {
        logger.info("Starting smart backup analysis");

        SmartBackupResult result = new SmartBackupResult();

        try {
            // Analyze and perform backups for each database
            for (DatabaseConfiguration databaseConfig : databaseService.getDatabases()) {
                logger.info("Analyzing backups for database: {}", databaseConfig.getName());

                List<Backup> existingBackups = backupService.getBackups(
                    databaseConfig.getPrefix(),
                    databaseConfig.isCreatePlainDump()
                );

                // Group backups by retention period
                Map<Integer, List<Backup>> backupsByRetention = existingBackups.stream()
                    .collect(Collectors.groupingBy(Backup::getRetentionPeriod));

                // Check and perform daily backup if needed
                if (isBackupNeeded(backupsByRetention.get(DAILY_RETENTION), DAILY_INTERVAL)) {
                    logger.info("Daily backup needed for database: {}", databaseConfig.getName());
                    performBackupForDatabase(databaseConfig, DAILY_RETENTION);
                    result.addBackupPerformed(databaseConfig.getName(), DAILY_RETENTION);
                }

                // Check and perform weekly backup if needed
                if (isBackupNeeded(backupsByRetention.get(WEEKLY_RETENTION), WEEKLY_INTERVAL)) {
                    logger.info("Weekly backup needed for database: {}", databaseConfig.getName());
                    performBackupForDatabase(databaseConfig, WEEKLY_RETENTION);
                    result.addBackupPerformed(databaseConfig.getName(), WEEKLY_RETENTION);
                }

                // Check and perform monthly backup if needed
                if (isBackupNeeded(backupsByRetention.get(MONTHLY_RETENTION), MONTHLY_INTERVAL)) {
                    logger.info("Monthly backup needed for database: {}", databaseConfig.getName());
                    performBackupForDatabase(databaseConfig, MONTHLY_RETENTION);
                    result.addBackupPerformed(databaseConfig.getName(), MONTHLY_RETENTION);
                }
            }

            // Perform cleanup of expired backups
            logger.info("Performing cleanup of expired backups");
            backupOrchestrationService.performCleanup();
            result.setCleanupPerformed(true);

        } catch (Exception e) {
            logger.error("Error during smart backup operation", e);
            result.setError(e.getMessage());
        }

        logger.info("Smart backup completed. Summary: {}", result);
        return result;
    }

    /**
     * Determines if a backup is needed based on the last backup time and interval.
     *
     * @param backups List of backups for a specific retention period
     * @param interval Required interval between backups
     * @return true if a new backup is needed
     */
    private boolean isBackupNeeded(List<Backup> backups, Duration interval) {
        if (backups == null || backups.isEmpty()) {
            // No backups exist for this retention period, backup is needed
            return true;
        }

        // Get the most recent backup
        Instant lastBackupTime = backups.stream()
            .map(Backup::getLastModified)
            .max(Instant::compareTo)
            .orElse(Instant.EPOCH);

        // Check if enough time has passed since the last backup
        Duration timeSinceLastBackup = Duration.between(lastBackupTime, Instant.now());
        boolean needed = timeSinceLastBackup.compareTo(interval) >= 0;

        if (needed) {
            logger.debug("Backup needed: Last backup was {} ago, interval is {}",
                timeSinceLastBackup, interval);
        } else {
            logger.debug("Backup not needed: Last backup was {} ago, interval is {}",
                timeSinceLastBackup, interval);
        }

        return needed;
    }

    /**
     * Performs a backup for a specific database with the specified retention period.
     *
     * @param databaseConfig Database configuration
     * @param retentionPeriod Number of days to retain the backup
     */
    private void performBackupForDatabase(DatabaseConfiguration databaseConfig, int retentionPeriod) {
        try {
            logger.info("Performing backup for database {} with {}-day retention",
                databaseConfig.getName(), retentionPeriod);
            backupOrchestrationService.performBackupForDatabase(databaseConfig, retentionPeriod);
            logger.info("Backup for database {} with {}-day retention completed successfully",
                databaseConfig.getName(), retentionPeriod);
        } catch (Exception e) {
            logger.error("Failed to perform backup for database {} with {}-day retention",
                databaseConfig.getName(), retentionPeriod, e);
            throw new RuntimeException("Backup failed for database " + databaseConfig.getName() +
                " with retention period: " + retentionPeriod, e);
        }
    }

    /**
     * Result class to track smart backup operations performed.
     */
    public static class SmartBackupResult {
        private final List<BackupOperation> backupsPerformed = new ArrayList<>();
        private boolean cleanupPerformed = false;
        private String error = null;

        public void addBackupPerformed(String database, int retentionPeriod) {
            backupsPerformed.add(new BackupOperation(database, retentionPeriod));
        }

        public void setCleanupPerformed(boolean cleanupPerformed) {
            this.cleanupPerformed = cleanupPerformed;
        }

        public void setError(String error) {
            this.error = error;
        }

        public List<BackupOperation> getBackupsPerformed() {
            return backupsPerformed;
        }

        public boolean isCleanupPerformed() {
            return cleanupPerformed;
        }

        public String getError() {
            return error;
        }

        public boolean hasError() {
            return error != null;
        }

        @Override
        public String toString() {
            return String.format(
                "SmartBackupResult{backupsPerformed=%d, cleanupPerformed=%s, error=%s}",
                backupsPerformed.size(), cleanupPerformed, error
            );
        }

        public static class BackupOperation {
            private final String database;
            private final int retentionPeriod;

            public BackupOperation(String database, int retentionPeriod) {
                this.database = database;
                this.retentionPeriod = retentionPeriod;
            }

            public String getDatabase() {
                return database;
            }

            public int getRetentionPeriod() {
                return retentionPeriod;
            }
        }
    }
}

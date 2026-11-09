package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.model.FolderBackupConfig;
import io.github.mucsi96.postgresbackuptool.service.FolderBackupService.FolderBackupItem;
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
    private final FolderBackupService folderBackupService;
    private final ZipService zipService;

    /**
     * Performs backup for all configured databases with the specified retention period.
     * All backups are created as ZIP files containing pgdump, SQL dump, and folder files (if configured).
     *
     * @param retentionPeriod Number of days to retain the backup
     * @throws IOException If an I/O error occurs
     * @throws InterruptedException If the backup process is interrupted
     */
    public void performBackup(int retentionPeriod) throws IOException, InterruptedException {
        String timeString = dateTimeFormatter.format(Instant.now());

        for (DatabaseConfiguration databaseConfiguration : databaseService.getDatabases()) {
            try {
                logger.info("Creating ZIP backup for database: {} with retention: {} days",
                        databaseConfiguration.getName(), retentionPeriod);

                // Always create ZIP backup
                createZipBackup(retentionPeriod, databaseConfiguration, timeString);

                logger.info("Backup completed for database: {}", databaseConfiguration.getName());
            } catch (IOException | InterruptedException e) {
                logger.error("Failed to backup database: {}", databaseConfiguration.getName(), e);
                throw new RuntimeException("Failed to backup database: " + databaseConfiguration.getName(), e);
            }
        }
    }

    /**
     * Performs backup for a specific database with the specified retention period.
     * All backups are created as ZIP files containing pgdump, SQL dump, and folder files (if configured).
     *
     * @param databaseConfiguration The database configuration
     * @param retentionPeriod Number of days to retain the backup
     * @throws IOException If an I/O error occurs
     * @throws InterruptedException If the backup process is interrupted
     */
    public void performBackupForDatabase(DatabaseConfiguration databaseConfiguration, int retentionPeriod)
            throws IOException, InterruptedException {
        String timeString = dateTimeFormatter.format(Instant.now());

        try {
            logger.info("Creating ZIP backup for database: {} with retention: {} days",
                    databaseConfiguration.getName(), retentionPeriod);

            // Always create ZIP backup
            createZipBackup(retentionPeriod, databaseConfiguration, timeString);

            logger.info("Backup completed for database: {}", databaseConfiguration.getName());
        } catch (IOException | InterruptedException e) {
            logger.error("Failed to backup database: {}", databaseConfiguration.getName(), e);
            throw new RuntimeException("Failed to backup database: " + databaseConfiguration.getName(), e);
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

    private void createZipBackup(int retentionPeriod, DatabaseConfiguration databaseConfiguration, String timeString)
            throws IOException, InterruptedException {
        File dumpFile = null;
        File plainDumpFile = null;
        File zipFile = null;

        try {
            // Always create custom format dump (pgdump)
            logger.info("Creating pgdump (custom format) for: {}", databaseConfiguration.getName());
            dumpFile = databaseService.createDump(
                    databaseConfiguration.getName(),
                    "custom");

            // Always create plain SQL dump
            logger.info("Creating SQL dump (plain format) for: {}", databaseConfiguration.getName());
            plainDumpFile = databaseService.createDump(
                    databaseConfiguration.getName(),
                    "plain");

            // Collect folder files from local file system
            logger.info("Collecting files for backup from {} folders",
                    databaseConfiguration.getFolderBackups().size());
            List<FolderBackupItem> folderItems = folderBackupService.collectFolders(
                    databaseConfiguration.getFolderBackups());

            // Get total row count for metadata
            int totalRowCount = databaseService.getDatabaseInfo(databaseConfiguration.getName()).getTotalRowCount();

            // Get folder file metadata
            int fileCount = folderItems.size();
            long filesTotalSize = folderBackupService.getTotalSize(folderItems);

            // Create ZIP file
            logger.info("Creating ZIP archive with dump and {} files", folderItems.size());
            ZipService.ZipCreationResult zipResult = zipService.createBackupZip(
                    dumpFile,
                    plainDumpFile,
                    folderItems,
                    timeString,
                    totalRowCount,
                    retentionPeriod,
                    fileCount,
                    filesTotalSize);
            zipFile = zipResult.getZipFile();

            // Upload ZIP to blob storage with proper filename
            logger.info("Uploading ZIP backup to blob storage as: {}", zipResult.getFileName());
            backupService.createBackup(databaseConfiguration.getPrefix(), zipFile, zipResult.getFileName());

            logger.info("Successfully created ZIP backup with {} files (total size: {} bytes)",
                    folderItems.size(), folderBackupService.getTotalSize(folderItems));

        } finally {
            // Clean up temporary files
            cleanupTempFile(dumpFile, "dump file");
            cleanupTempFile(plainDumpFile, "plain dump file");
            cleanupTempFile(zipFile, "ZIP file");
        }
    }

    /**
     * Restores a ZIP backup for a specific database.
     * All backups are ZIP files containing pgdump, SQL dump, and folder files (if configured).
     *
     * @param databaseConfiguration The database configuration
     * @param backupFile The ZIP backup file to restore
     * @throws IOException If an I/O error occurs
     * @throws InterruptedException If the restore process is interrupted
     */
    public void restoreBackup(DatabaseConfiguration databaseConfiguration, File backupFile)
            throws IOException, InterruptedException {
        if (!backupFile.getName().endsWith(".zip")) {
            throw new IOException("Invalid backup file format. Expected ZIP file.");
        }

        restoreZipBackup(databaseConfiguration, backupFile);
    }

    private void restoreZipBackup(DatabaseConfiguration databaseConfiguration, File zipFile)
            throws IOException, InterruptedException {
        File extractionDir = null;

        try {
            // Extract ZIP backup
            extractionDir = Files.createTempDirectory("restore-").toFile();
            logger.info("Extracting backup ZIP to: {}", extractionDir.getPath());

            ZipService.ZipExtractionResult result = zipService.extractBackupZip(zipFile, extractionDir);

            // Restore database dump
            if (result.getDatabaseDumpFile() != null) {
                logger.info("Restoring database from: {}", result.getDatabaseDumpFile().getPath());
                databaseService.restoreDump(databaseConfiguration.getName(), result.getDatabaseDumpFile());
                logger.info("Database restore completed");
            } else {
                throw new IOException("No database dump found in ZIP backup");
            }

            // Restore folder files to local file system
            if (!result.getFolderFiles().isEmpty()) {
                logger.info("Restoring {} files to local folders", result.getFolderFiles().size());

                // Build map from folder name to full configured path
                Map<String, String> folderNameToPath = new HashMap<>();
                for (FolderBackupConfig config : databaseConfiguration.getFolderBackups()) {
                    String folderName = Paths.get(config.getPath()).getFileName().toString();
                    folderNameToPath.put(folderName, config.getPath());
                }

                for (ZipService.FolderFileRestorationItem fileItem : result.getFolderFiles()) {
                    String fullFolderPath = folderNameToPath.get(fileItem.getFolderPath());
                    if (fullFolderPath == null) {
                        logger.warn("Unknown folder name in backup: {}, skipping", fileItem.getFolderPath());
                        continue;
                    }
                    File targetFile = new File(fullFolderPath, fileItem.getRelativePath());
                    targetFile.getParentFile().mkdirs();

                    java.nio.file.Files.copy(
                        fileItem.getExtractedFile().toPath(),
                        targetFile.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING
                    );
                    logger.debug("Restored file: {} to {}",
                        fileItem.getRelativePath(), targetFile.getAbsolutePath());
                }

                logger.info("Successfully restored {} files", result.getFolderFiles().size());
            } else {
                logger.info("No folder files to restore in this backup");
            }

        } finally {
            // Clean up extraction directory
            if (extractionDir != null && extractionDir.exists()) {
                deleteDirectory(extractionDir);
            }
        }
    }

    private void cleanupTempFile(File file, String description) {
        if (file != null && file.exists()) {
            boolean deleted = file.delete();
            if (!deleted) {
                logger.warn("Failed to delete temporary {}: {}", description, file.getAbsolutePath());
            }
        }
    }

    private void deleteDirectory(File directory) {
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    file.delete();
                }
            }
        }
        directory.delete();
    }
}

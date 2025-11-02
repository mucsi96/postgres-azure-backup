package io.github.mucsi96.postgresbackuptool.controller;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.model.Backup;
import io.github.mucsi96.postgresbackuptool.service.BackupOrchestrationService;
import io.github.mucsi96.postgresbackuptool.service.BackupService;
import io.github.mucsi96.postgresbackuptool.service.DatabaseService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService.SmartBackupResult;
import io.github.mucsi96.postgresbackuptool.service.ZipService;
import lombok.RequiredArgsConstructor;

@RestController
@Validated
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE, path = "/api")
@RequiredArgsConstructor
public class BackupController {
    private final BackupService backupService;
    private final DatabaseService databaseService;
    private final BackupOrchestrationService backupOrchestrationService;
    private final SmartBackupService smartBackupService;
    private final ZipService zipService;

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupCreator')")
    @PostMapping("/smart-backup")
    @ResponseBody
    SmartBackupResult performSmartBackup() {
        return smartBackupService.performSmartBackup();
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupsReader') and hasAuthority('SCOPE_readBackups')")
    @GetMapping("/database/{database_name}/backups")
    @ResponseBody
    List<Backup> list(@PathVariable("database_name") String databaseName) {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);
        return backupService.getBackups(databaseConfiguration.getPrefix());
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupRestorer') and hasAuthority('SCOPE_restoreBackup')")
    @PostMapping("/database/{database_name}/restore/{key}")
    @ResponseBody
    void restore(@PathVariable("database_name") String databaseName,
            @PathVariable String key) throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);
        File backupFile = backupService
                .downloadBackup(databaseConfiguration.getPrefix(), key);
        backupOrchestrationService.restoreBackup(databaseConfiguration, backupFile);

        backupFile.delete();
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupsReader') and hasAuthority('SCOPE_readBackups')")
    @GetMapping("/database/{database_name}/last-backup-time")
    @ResponseBody
    Optional<Instant> lastBackupTime(
            @PathVariable("database_name") String databaseName) {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);
        return backupService.getLastBackupTime(databaseConfiguration.getPrefix());
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupDownloader') and hasAuthority('SCOPE_downloadBackup')")
    @GetMapping("/database/{database_name}/backup/{key}/archive")
    ResponseEntity<Resource> downloadArchive(@PathVariable("database_name") String databaseName,
            @PathVariable String key)
            throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);

        // Download the backup ZIP from blob storage
        File backupZipFile = backupService
                .downloadBackup(databaseConfiguration.getPrefix(), key);

        try {
            // Stream the ZIP file to the browser
            InputStreamResource resource = new InputStreamResource(new FileInputStream(backupZipFile));

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + key + "\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(backupZipFile.length())
                    .body(resource);
        } finally {
            // Note: backupZipFile cleanup will happen after streaming completes
            // We create a temp file that will be cleaned up by the OS
        }
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupDownloader') and hasAuthority('SCOPE_downloadBackup')")
    @GetMapping("/database/{database_name}/backup/{key}/pgdump")
    ResponseEntity<Resource> downloadPgdump(@PathVariable("database_name") String databaseName,
            @PathVariable String key)
            throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);

        // Download the backup ZIP from blob storage
        File backupZipFile = backupService
                .downloadBackup(databaseConfiguration.getPrefix(), key);

        File pgdumpFile = null;
        try {
            // Extract the pgdump file from ZIP
            pgdumpFile = zipService.extractPgdumpFile(backupZipFile);

            // Stream the file to the browser
            InputStreamResource resource = new InputStreamResource(new FileInputStream(pgdumpFile));

            // Generate a clean filename for download
            String filename = key.replace(".zip", ".pgdump");

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(pgdumpFile.length())
                    .body(resource);
        } finally {
            // Clean up the backup ZIP file
            if (backupZipFile.exists()) {
                backupZipFile.delete();
            }
            // Note: pgdumpFile cleanup will happen after streaming completes
            // We create a temp file that will be cleaned up by the OS
        }
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupDownloader') and hasAuthority('SCOPE_downloadBackup')")
    @GetMapping("/database/{database_name}/backup/{key}/sql")
    ResponseEntity<Resource> downloadSql(@PathVariable("database_name") String databaseName,
            @PathVariable String key)
            throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);

        // Download the backup ZIP from blob storage
        File backupZipFile = backupService
                .downloadBackup(databaseConfiguration.getPrefix(), key);

        File sqlFile = null;
        try {
            // Extract the SQL file from ZIP
            sqlFile = zipService.extractPlainSqlFile(backupZipFile);

            // Stream the file to the browser
            InputStreamResource resource = new InputStreamResource(new FileInputStream(sqlFile));

            // Generate a clean filename for download
            String filename = key.replace(".zip", ".sql");

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .contentType(MediaType.TEXT_PLAIN)
                    .contentLength(sqlFile.length())
                    .body(resource);
        } finally {
            // Clean up the backup ZIP file
            if (backupZipFile.exists()) {
                backupZipFile.delete();
            }
            // Note: sqlFile cleanup will happen after streaming completes
            // We create a temp file that will be cleaned up by the OS
        }
    }
}

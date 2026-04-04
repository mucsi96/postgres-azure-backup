package io.github.mucsi96.postgresbackuptool.controller;

import java.io.File;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.MediaType;
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
import io.github.mucsi96.postgresbackuptool.service.DownloadTokenService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService.SmartBackupResult;
import lombok.RequiredArgsConstructor;

@RestController
@Validated
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE, path = "/")
@RequiredArgsConstructor
public class BackupController {
    private final BackupService backupService;
    private final DatabaseService databaseService;
    private final BackupOrchestrationService backupOrchestrationService;
    private final SmartBackupService smartBackupService;
    private final DownloadTokenService downloadTokenService;

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupCreator')")
    @PostMapping("/smart-backup")
    @ResponseBody
    SmartBackupResult performSmartBackup() {
        return smartBackupService.performSmartBackup();
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupCreator')")
    @PostMapping("/database/{database_name}/backup")
    @ResponseBody
    void performBackup(@PathVariable("database_name") String databaseName)
            throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);
        backupOrchestrationService.performBackupForDatabase(databaseConfiguration, 7);
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
    @PostMapping("/database/{database_name}/backup/{key}/{type}/download-token")
    @ResponseBody
    Map<String, String> createDownloadToken(
            @PathVariable("database_name") String databaseName,
            @PathVariable String key,
            @PathVariable String type) {
        // Validate database exists
        databaseService.getDatabaseConfiguration(databaseName);

        String token = downloadTokenService.createToken(databaseName, key, type);
        return Map.of("token", token);
    }

    @PreAuthorize("hasAuthority('APPROLE_DatabaseBackupDownloader') and hasAuthority('SCOPE_downloadBackup')")
    @PostMapping("/database/{database_name}/export-sql/download-token")
    @ResponseBody
    Map<String, String> createExportSqlDownloadToken(
            @PathVariable("database_name") String databaseName) {
        // Validate database exists
        databaseService.getDatabaseConfiguration(databaseName);

        String token = downloadTokenService.createToken(databaseName, "", "data-export");
        return Map.of("token", token);
    }
}

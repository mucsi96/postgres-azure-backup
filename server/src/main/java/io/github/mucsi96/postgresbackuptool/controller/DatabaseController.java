package io.github.mucsi96.postgresbackuptool.controller;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.model.Backup;
import io.github.mucsi96.postgresbackuptool.model.Database;
import io.github.mucsi96.postgresbackuptool.model.DatabaseInfo;
import io.github.mucsi96.postgresbackuptool.service.BackupService;
import io.github.mucsi96.postgresbackuptool.service.FolderBackupService;
import io.github.mucsi96.postgresbackuptool.service.DatabaseService;
import lombok.RequiredArgsConstructor;

@RestController
@Validated
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE, path = "/")
@RequiredArgsConstructor
public class DatabaseController {
    private final DatabaseService databaseService;
    private final BackupService backupService;
    private final FolderBackupService folderBackupService;

    @PreAuthorize("hasAuthority('APPROLE_readBackups')")
    @GetMapping("/databases")
    @ResponseBody
    public List<Database> getDatabases() {
        return databaseService.getDatabaseNames().stream().map(databaseName -> {
            DatabaseService.DatabaseSummary summary = databaseService
                    .getDatabaseSummary(databaseName);
            DatabaseConfiguration databaseConfiguration = databaseService
                    .getDatabaseConfiguration(databaseName);
            List<Backup> backups = backupService
                    .getBackups(databaseConfiguration.getPrefix());
            Optional<Instant> lastBackupTime = backups.stream().findFirst()
                    .map(Backup::getLastModified);
            int totalFileCount = folderBackupService
                    .collectFolders(databaseConfiguration.getFolderBackups()).size();
            return Database.builder().name(databaseName)
                    .totalRowCount(summary.totalRowCount())
                    .tablesCount(summary.tablesCount())
                    .fileCount(totalFileCount)
                    .backupsCount(backups.size())
                    .lastBackupTime(lastBackupTime.orElse(null)).build();
        }).toList();
    }

    @PreAuthorize("hasAuthority('APPROLE_readBackups')")
    @GetMapping("/database/{database_name}/tables")
    @ResponseBody
    public DatabaseInfo getDatabaseInfo(
            @PathVariable("database_name") String databaseName) {
        DatabaseInfo databaseInfo = databaseService.getDatabaseInfo(databaseName);
        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(databaseName);
        int totalFileCount = folderBackupService
                .collectFolders(databaseConfiguration.getFolderBackups()).size();
        return DatabaseInfo.builder()
                .tables(databaseInfo.getTables())
                .totalRowCount(databaseInfo.getTotalRowCount())
                .fileCount(totalFileCount)
                .build();
    }
}

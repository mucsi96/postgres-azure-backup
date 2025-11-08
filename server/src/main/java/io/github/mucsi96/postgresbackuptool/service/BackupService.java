package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.models.BlobItem;
import com.azure.storage.blob.models.ListBlobsOptions;

import io.github.mucsi96.postgresbackuptool.model.Backup;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BackupService {
    private final BlobServiceClient blobServiceClient;
    private final DateTimeFormatter dateTimeFormatter;
    private final String containerName;

    public BackupService(BlobServiceClient blobServiceClient,
            DateTimeFormatter dateTimeFormatter,
            @Value("${blobstorage.containerName}") String containerName) {
        this.blobServiceClient = blobServiceClient;
        this.dateTimeFormatter = dateTimeFormatter;
        this.containerName = containerName;
    }

    public List<Backup> getBackups(String prefix) {
        return Optional.of(blobServiceClient.getBlobContainerClient(containerName))
                .filter(BlobContainerClient::exists)
                .map(container -> listAndTransformBlobs(container, prefix))
                .orElse(Collections.emptyList());
    }

    private List<Backup> listAndTransformBlobs(BlobContainerClient container, String prefix) {
        return container
                .listBlobs(new ListBlobsOptions().setPrefix(prefix + "/"), null)
                .stream()
                .filter(blob -> blob.getName().endsWith(".zip"))  // Only ZIP files
                .map(blob -> createBackupFromBlob(blob, prefix))
                .sorted((a, b) -> b.getLastModified().compareTo(a.getLastModified()))
                .toList();
    }

    private Backup createBackupFromBlob(BlobItem blob, String prefix) {
        String name = getBackupName(prefix, blob);

        // Parse metadata from filename
        return Backup.builder()
                .name(name)
                .lastModified(parseBackupTimestamp(name))
                .size(blob.getProperties().getContentLength())
                .totalRowCount(getTotalCountFromName(prefix, blob))
                .fileCount(getFileCountFromName(prefix, blob))
                .filesTotalSize(getFilesTotalSizeFromName(prefix, blob))
                .retentionPeriod(getRetentionPeriodFromName(prefix, blob))
                .hasPlainDump(true)
                .build();
    }

    private Instant parseBackupTimestamp(String name) {
        return dateTimeFormatter.parse(name.substring(0, 15), Instant::from);
    }

    public void createBackup(String prefix, File dumpFile, String fileName) {
        BlobContainerClient blobContainerClient = blobServiceClient
                .getBlobContainerClient(containerName);

        blobContainerClient.getBlobClient(prefix + "/" + fileName)
                .uploadFromFile(dumpFile.getAbsolutePath());
    }

    public File downloadBackup(String prefix, String key) throws IOException {
        BlobContainerClient blobContainerClient = blobServiceClient
                .getBlobContainerClient(containerName);

        blobContainerClient.getBlobClient(prefix + "/" + key)
                .downloadToFile(key);

        return new File(key);
    }

    public void cleanup(String prefix) {
        BlobContainerClient blobContainerClient = blobServiceClient
                .getBlobContainerClient(containerName);

        blobContainerClient
                .listBlobs(new ListBlobsOptions().setPrefix(prefix + "/"), null)
                .stream().filter(blobItem -> shouldCleanup(prefix, blobItem))
                .forEach(blobItem -> blobContainerClient
                        .getBlobClient(blobItem.getName()).delete());
    }

    public Optional<Instant> getLastBackupTime(String prefix) {
        return getBackups(prefix).stream().findFirst()
                .map(Backup::getLastModified);
    }

    private int getTotalCountFromName(String prefix, BlobItem backup) {
        return Integer.parseInt(getBackupName(prefix, backup).split("\\.")[1]);
    }

    private int getFileCountFromName(String prefix, BlobItem backup) {
        return Integer.parseInt(getBackupName(prefix, backup).split("\\.")[2]);
    }

    private long getFilesTotalSizeFromName(String prefix, BlobItem backup) {
        return Long.parseLong(getBackupName(prefix, backup).split("\\.")[3]);
    }

    private int getRetentionPeriodFromName(String prefix, BlobItem backup) {
        return Integer.parseInt(getBackupName(prefix, backup).split("\\.")[4]);
    }

    private boolean shouldCleanup(String prefix, BlobItem backup) {
        Backup b = Backup.builder().name(backup.getName())
                .lastModified(dateTimeFormatter.parse(
                        getBackupName(prefix, backup).substring(0, 15),
                        Instant::from))
                .retentionPeriod(getRetentionPeriodFromName(prefix, backup))
                .build();
        Instant cleanupDate = b.getLastModified()
                .plus(Duration.ofDays(b.getRetentionPeriod()));

        return cleanupDate.isBefore(Instant.now());
    }

    private static String getBackupName(String prefix, BlobItem backup) {
        return backup.getName().substring(prefix.length() + 1);
    }
}

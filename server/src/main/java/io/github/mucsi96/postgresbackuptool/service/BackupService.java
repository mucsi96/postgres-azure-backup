package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.core.io.WritableResource;
import org.springframework.stereotype.Service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.models.BlobItem;
import com.azure.storage.blob.models.BlobItemProperties;
import com.azure.storage.blob.models.BlobProperties;
import com.azure.storage.blob.models.ListBlobsOptions;

import io.github.mucsi96.postgresbackuptool.model.Backup;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BackupService {
    private final DateTimeFormatter dateTimeFormatter;
    private final String containerName;
    private final ResourceLoader resourceLoader;
    private final BlobContainerClient blobContainerClient;

    public BackupService(DateTimeFormatter dateTimeFormatter,
            @Value("${spring.cloud.azure.storage.blob.container-name}") String containerName,
            ResourceLoader resourceLoader,
            BlobContainerClient blobContainerClient) {
        this.dateTimeFormatter = dateTimeFormatter;
        this.containerName = containerName;
        this.resourceLoader = resourceLoader;
        this.blobContainerClient = blobContainerClient;
    }

    public List<Backup> getBackups(String prefix) {
        List<Backup> backups = new ArrayList<>();
        ListBlobsOptions options = new ListBlobsOptions()
                .setPrefix(prefix + "/");
        for (BlobItem item : blobContainerClient.listBlobs(options, null)) {
            String name = item.getName();
            if (!name.endsWith(".zip")) {
                continue;
            }
            backups.add(createBackupFromBlobItem(item, prefix));
        }
        backups.sort(Comparator.comparing(Backup::getLastModified).reversed());
        return backups;
    }

    private Backup createBackupFromBlobItem(BlobItem item, String prefix) {
        String name = item.getName().substring(prefix.length() + 1);
        BlobItemProperties properties = item.getProperties();
        long size = properties.getContentLength() != null
                ? properties.getContentLength()
                : 0L;
        Instant lastModified = properties.getLastModified() != null
                ? properties.getLastModified().toInstant()
                : parseBackupTimestamp(name);
        return Backup.builder().name(name)
                .lastModified(lastModified)
                .size(size)
                .totalRowCount(getTotalCountFromName(name))
                .fileCount(getFileCountFromName(name))
                .filesTotalSize(getFilesTotalSizeFromName(name))
                .retentionPeriod(getRetentionPeriodFromName(name))
                .hasPlainDump(true).build();
    }

    private Instant parseBackupTimestamp(String name) {
        return dateTimeFormatter.parse(name.substring(0, 15), Instant::from);
    }

    public void createBackup(String prefix, File dumpFile, String fileName)
            throws IOException {
        String location = String.format("azure-blob://%s/%s/%s", containerName,
                prefix, fileName);
        WritableResource resource = (WritableResource) resourceLoader
                .getResource(location);
        try (OutputStream os = resource.getOutputStream()) {
            Files.copy(dumpFile.toPath(), os);
        }
    }

    public record BackupStreamInfo(InputStream inputStream, long contentLength) {}

    public BackupStreamInfo streamBackup(String prefix, String key) {
        BlobClient blobClient = blobContainerClient
                .getBlobClient(prefix + "/" + key);
        BlobProperties properties = blobClient.getProperties();
        InputStream inputStream = blobClient.openInputStream();
        return new BackupStreamInfo(inputStream, properties.getBlobSize());
    }

    public File downloadBackup(String prefix, String key) throws IOException {
        String location = String.format("azure-blob://%s/%s/%s", containerName,
                prefix, key);
        Resource resource = resourceLoader.getResource(location);
        File file = File.createTempFile("backup-", ".zip");
        Files.copy(resource.getInputStream(), file.toPath(),
                StandardCopyOption.REPLACE_EXISTING);
        return file;
    }

    public void cleanup(String prefix) {
        getBackups(prefix).stream().filter(this::shouldCleanup)
                .forEach(backup -> blobContainerClient
                        .getBlobClient(prefix + "/" + backup.getName())
                        .delete());
    }

    public java.util.Optional<Instant> getLastBackupTime(String prefix) {
        return getBackups(prefix).stream().findFirst()
                .map(Backup::getLastModified);
    }

    private int getTotalCountFromName(String name) {
        return Integer.parseInt(name.split("\\.")[1]);
    }

    private int getFileCountFromName(String name) {
        return Integer.parseInt(name.split("\\.")[2]);
    }

    private long getFilesTotalSizeFromName(String name) {
        return Long.parseLong(name.split("\\.")[3]);
    }

    private int getRetentionPeriodFromName(String name) {
        return Integer.parseInt(name.split("\\.")[4]);
    }

    private boolean shouldCleanup(Backup backup) {
        Instant cleanupDate = backup.getLastModified()
                .plus(Duration.ofDays(backup.getRetentionPeriod()));

        return cleanupDate.isBefore(Instant.now());
    }
}

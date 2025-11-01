package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.models.BlobItem;
import com.azure.storage.blob.models.ListBlobsOptions;
import com.azure.storage.blob.models.UserDelegationKey;
import com.azure.storage.blob.sas.BlobSasPermission;
import com.azure.storage.blob.sas.BlobServiceSasSignatureValues;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.mucsi96.postgresbackuptool.model.Backup;
import io.github.mucsi96.postgresbackuptool.model.BackupType;
import io.github.mucsi96.postgresbackuptool.service.ZipService.BackupManifest;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BackupService {
    private final BlobServiceClient blobServiceClient;
    private final DateTimeFormatter dateTimeFormatter;
    private final String containerName;
    private final ObjectMapper objectMapper;

    public BackupService(BlobServiceClient blobServiceClient,
            DateTimeFormatter dateTimeFormatter,
            @Value("${blobstorage.containerName}") String containerName,
            ObjectMapper objectMapper) {
        this.blobServiceClient = blobServiceClient;
        this.dateTimeFormatter = dateTimeFormatter;
        this.containerName = containerName;
        this.objectMapper = objectMapper;
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

        // All backups are ZIP files - extract metadata from manifest
        try {
            BackupManifest manifest = extractManifestFromZipBlob(prefix, blob);
            if (manifest != null) {
                return Backup.builder()
                        .name(name)
                        .lastModified(parseBackupTimestamp(manifest.getTimestamp()))
                        .size(blob.getProperties().getContentLength())
                        .totalRowCount(manifest.getTotalRowCount())
                        .retentionPeriod(manifest.getRetentionPeriod())
                        .hasPlainDump(manifest.getPlainDump() != null)
                        .blobCount(manifest.getBlobs().size())
                        .blobsTotalSize(manifest.getBlobs().stream()
                                .mapToLong(b -> b.getSize())
                                .sum())
                        .build();
            }
        } catch (Exception e) {
            log.warn("Failed to extract manifest from ZIP backup: {}", name, e);
        }

        // Fallback to filename-based parsing if manifest extraction fails
        return Backup.builder()
                .name(name)
                .lastModified(parseBackupTimestamp(name))
                .size(blob.getProperties().getContentLength())
                .totalRowCount(getTotalCountFromName(prefix, blob))
                .retentionPeriod(getRetentionPeriodFromName(prefix, blob))
                .hasPlainDump(true)  // All ZIP backups have SQL dump
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

    public String getBackupUrl(String prefix, String key) throws IOException {
        BlobContainerClient blobContainerClient = blobServiceClient
                .getBlobContainerClient(containerName);

        BlobSasPermission permission = new BlobSasPermission()
                .setReadPermission(true);
        OffsetDateTime expiryTime = OffsetDateTime.now().plusMinutes(2);
        BlobServiceSasSignatureValues values = new BlobServiceSasSignatureValues(
                expiryTime, permission).setStartTime(OffsetDateTime.now());

        UserDelegationKey userDelegationKey = blobServiceClient
                .getUserDelegationKey(OffsetDateTime.now(), expiryTime);

        // All backups are ZIP files
        BlobClient blobClient = blobContainerClient
                .getBlobClient(prefix + "/" + key);
        return blobClient.getBlobUrl() + "?" + blobClient
                .generateUserDelegationSas(values, userDelegationKey);
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

    private int getRetentionPeriodFromName(String prefix, BlobItem backup) {
        return Integer.parseInt(getBackupName(prefix, backup).split("\\.")[2]);
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

    private BackupManifest extractManifestFromZipBlob(String prefix, BlobItem blob) throws IOException {
        BlobContainerClient containerClient = blobServiceClient.getBlobContainerClient(containerName);
        BlobClient blobClient = containerClient.getBlobClient(blob.getName());

        File tempZipFile = File.createTempFile("backup-", ".zip");
        try {
            // Download ZIP file
            blobClient.downloadToFile(tempZipFile.getAbsolutePath(), true);

            // Extract and parse manifest
            try (ZipInputStream zipIn = new ZipInputStream(new FileInputStream(tempZipFile))) {
                ZipEntry entry;
                while ((entry = zipIn.getNextEntry()) != null) {
                    if (entry.getName().equals("MANIFEST.json")) {
                        byte[] manifestBytes = zipIn.readAllBytes();
                        String manifestJson = new String(manifestBytes, StandardCharsets.UTF_8);
                        return objectMapper.readValue(manifestJson, BackupManifest.class);
                    }
                    zipIn.closeEntry();
                }
            }
        } finally {
            if (tempZipFile.exists()) {
                tempZipFile.delete();
            }
        }

        return null;
    }
}

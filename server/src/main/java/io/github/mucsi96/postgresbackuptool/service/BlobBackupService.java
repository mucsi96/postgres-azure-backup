package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.models.BlobItem;
import com.azure.storage.blob.models.ListBlobsOptions;

import io.github.mucsi96.postgresbackuptool.model.BlobBackupConfig;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BlobBackupService {
    private final BlobServiceClient blobServiceClient;

    public BlobBackupService(BlobServiceClient blobServiceClient) {
        this.blobServiceClient = blobServiceClient;
    }

    @Data
    @Builder
    public static class BlobBackupItem {
        private String containerName;
        private String blobName;
        private String relativePath;
        private long size;
        private File downloadedFile;
    }

    public List<BlobBackupItem> collectBlobs(List<BlobBackupConfig> blobBackupConfigs) {
        List<BlobBackupItem> collectedBlobs = new ArrayList<>();

        for (BlobBackupConfig config : blobBackupConfigs) {
            log.info("Collecting blobs from container: {} with prefix: {}",
                config.getContainerName(), config.getPrefix());

            BlobContainerClient containerClient = blobServiceClient
                .getBlobContainerClient(config.getContainerName());

            if (!containerClient.exists()) {
                log.warn("Container does not exist: {}", config.getContainerName());
                continue;
            }

            ListBlobsOptions options = new ListBlobsOptions()
                .setPrefix(config.getPrefix());

            for (BlobItem blobItem : containerClient.listBlobs(options, null)) {
                BlobBackupItem item = BlobBackupItem.builder()
                    .containerName(config.getContainerName())
                    .blobName(blobItem.getName())
                    .relativePath(blobItem.getName())
                    .size(blobItem.getProperties().getContentLength())
                    .build();

                collectedBlobs.add(item);
                log.debug("Added blob: {} (size: {} bytes)",
                    blobItem.getName(), item.getSize());
            }
        }

        log.info("Collected {} blobs for backup", collectedBlobs.size());
        return collectedBlobs;
    }

    public void downloadBlob(BlobBackupItem item, File destinationFile) throws IOException {
        log.debug("Downloading blob: {} to {}", item.getBlobName(), destinationFile.getPath());

        BlobContainerClient containerClient = blobServiceClient
            .getBlobContainerClient(item.getContainerName());
        BlobClient blobClient = containerClient.getBlobClient(item.getBlobName());

        try (FileOutputStream outputStream = new FileOutputStream(destinationFile)) {
            blobClient.downloadStream(outputStream);
        }

        item.setDownloadedFile(destinationFile);
        log.debug("Successfully downloaded blob: {}", item.getBlobName());
    }

    public void uploadBlob(String containerName, String blobName, File file) throws IOException {
        log.debug("Uploading blob: {} to container: {}", blobName, containerName);

        BlobContainerClient containerClient = blobServiceClient
            .getBlobContainerClient(containerName);

        if (!containerClient.exists()) {
            log.info("Creating container: {}", containerName);
            containerClient.create();
        }

        BlobClient blobClient = containerClient.getBlobClient(blobName);
        blobClient.uploadFromFile(file.getAbsolutePath(), true);

        log.debug("Successfully uploaded blob: {}", blobName);
    }

    public long getTotalSize(List<BlobBackupItem> items) {
        return items.stream()
            .mapToLong(BlobBackupItem::getSize)
            .sum();
    }
}

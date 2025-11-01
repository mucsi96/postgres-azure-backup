package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.mucsi96.postgresbackuptool.service.BlobBackupService.BlobBackupItem;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ZipService {
    private static final String BLOBS_DIR = "blobs/";
    private static final String MANIFEST_FILE = "MANIFEST.json";
    private final ObjectMapper objectMapper;

    public ZipService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Data
    @Builder
    public static class BackupManifest {
        private String timestamp;
        private String databaseDump;
        private String plainDump;
        private int totalRowCount;
        private int retentionPeriod;
        @Builder.Default
        private List<BlobManifestEntry> blobs = new ArrayList<>();
    }

    @Data
    @Builder
    public static class BlobManifestEntry {
        private String containerName;
        private String blobName;
        private String pathInZip;
        private long size;
    }

    @Data
    @Builder
    public static class ZipExtractionResult {
        private File databaseDumpFile;
        private File plainDumpFile;
        private List<BlobRestorationItem> blobs;
        private BackupManifest manifest;
    }

    @Data
    @Builder
    public static class BlobRestorationItem {
        private String containerName;
        private String blobName;
        private File extractedFile;
    }

    @Data
    @Builder
    public static class ZipCreationResult {
        private File zipFile;
        private String fileName;
    }

    public ZipCreationResult createBackupZip(
        File databaseDumpFile,
        File plainDumpFile,
        List<BlobBackupItem> blobItems,
        String timestamp,
        int totalRowCount,
        int retentionPeriod
    ) throws IOException {
        // Use the same naming convention as before: YYYYMMDD-HHMMSS.rowCount.retention.zip
        String fileName = String.format("%s.%d.%d.zip", timestamp, totalRowCount, retentionPeriod);
        File zipFile = Files.createTempFile("backup-", ".zip").toFile();
        log.info("Creating backup ZIP file: {} (will be uploaded as: {})", zipFile.getPath(), fileName);

        try (ZipOutputStream zipOut = new ZipOutputStream(new FileOutputStream(zipFile))) {
            // Add database dump
            String dumpFileName = databaseDumpFile.getName();
            addFileToZip(zipOut, databaseDumpFile, dumpFileName);
            log.debug("Added database dump to ZIP: {}", dumpFileName);

            // Add plain dump if exists
            String plainDumpFileName = null;
            if (plainDumpFile != null && plainDumpFile.exists()) {
                plainDumpFileName = plainDumpFile.getName();
                addFileToZip(zipOut, plainDumpFile, plainDumpFileName);
                log.debug("Added plain dump to ZIP: {}", plainDumpFileName);
            }

            // Add blobs
            List<BlobManifestEntry> blobManifestEntries = new ArrayList<>();
            for (BlobBackupItem blobItem : blobItems) {
                if (blobItem.getDownloadedFile() != null && blobItem.getDownloadedFile().exists()) {
                    String pathInZip = BLOBS_DIR + blobItem.getContainerName() + "/" + blobItem.getRelativePath();
                    addFileToZip(zipOut, blobItem.getDownloadedFile(), pathInZip);

                    blobManifestEntries.add(BlobManifestEntry.builder()
                        .containerName(blobItem.getContainerName())
                        .blobName(blobItem.getBlobName())
                        .pathInZip(pathInZip)
                        .size(blobItem.getSize())
                        .build());

                    log.debug("Added blob to ZIP: {}", pathInZip);
                }
            }

            // Create and add manifest
            BackupManifest manifest = BackupManifest.builder()
                .timestamp(timestamp)
                .databaseDump(dumpFileName)
                .plainDump(plainDumpFileName)
                .totalRowCount(totalRowCount)
                .retentionPeriod(retentionPeriod)
                .blobs(blobManifestEntries)
                .build();

            String manifestJson = objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(manifest);

            ZipEntry manifestEntry = new ZipEntry(MANIFEST_FILE);
            zipOut.putNextEntry(manifestEntry);
            zipOut.write(manifestJson.getBytes(StandardCharsets.UTF_8));
            zipOut.closeEntry();
            log.debug("Added manifest to ZIP");
        }

        log.info("Successfully created backup ZIP: {} ({} blobs included)",
            zipFile.getPath(), blobItems.size());
        return ZipCreationResult.builder()
            .zipFile(zipFile)
            .fileName(fileName)
            .build();
    }

    public ZipExtractionResult extractBackupZip(File zipFile, File extractionDir) throws IOException {
        log.info("Extracting backup ZIP: {} to {}", zipFile.getPath(), extractionDir.getPath());

        if (!extractionDir.exists()) {
            extractionDir.mkdirs();
        }

        File databaseDumpFile = null;
        File plainDumpFile = null;
        BackupManifest manifest = null;
        List<File> extractedBlobFiles = new ArrayList<>();
        List<String> blobPaths = new ArrayList<>();

        // First pass: Extract all files and read manifest
        try (ZipInputStream zipIn = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                String entryName = entry.getName();
                File extractedFile = new File(extractionDir, entryName);

                if (entry.isDirectory()) {
                    extractedFile.mkdirs();
                    continue;
                }

                // Ensure parent directory exists
                extractedFile.getParentFile().mkdirs();

                if (entryName.equals(MANIFEST_FILE)) {
                    // Read manifest
                    byte[] manifestBytes = zipIn.readAllBytes();
                    String manifestJson = new String(manifestBytes, StandardCharsets.UTF_8);
                    manifest = objectMapper.readValue(manifestJson, BackupManifest.class);
                    log.debug("Read manifest from ZIP");
                } else if (entryName.startsWith(BLOBS_DIR)) {
                    // Extract blob
                    extractFileFromZip(zipIn, extractedFile);
                    extractedBlobFiles.add(extractedFile);
                    blobPaths.add(entryName);
                    log.debug("Extracted blob: {}", entryName);
                } else if (entryName.endsWith(".sql")) {
                    // Plain dump
                    extractFileFromZip(zipIn, extractedFile);
                    plainDumpFile = extractedFile;
                    log.debug("Extracted plain dump: {}", entryName);
                } else {
                    // Database dump
                    extractFileFromZip(zipIn, extractedFile);
                    databaseDumpFile = extractedFile;
                    log.debug("Extracted database dump: {}", entryName);
                }

                zipIn.closeEntry();
            }
        }

        // Second pass: Match extracted blobs with manifest entries
        List<BlobRestorationItem> blobs = new ArrayList<>();
        if (manifest != null) {
            for (int i = 0; i < extractedBlobFiles.size(); i++) {
                File extractedFile = extractedBlobFiles.get(i);
                String blobPath = blobPaths.get(i);

                manifest.getBlobs().stream()
                    .filter(bme -> bme.getPathInZip().equals(blobPath))
                    .findFirst()
                    .ifPresent(bme -> {
                        blobs.add(BlobRestorationItem.builder()
                            .containerName(bme.getContainerName())
                            .blobName(bme.getBlobName())
                            .extractedFile(extractedFile)
                            .build());
                        log.debug("Matched blob for restoration: {} -> {}",
                            blobPath, bme.getBlobName());
                    });
            }
        }

        log.info("Successfully extracted backup ZIP: {} files, {} blobs",
            databaseDumpFile != null ? 1 : 0, blobs.size());

        return ZipExtractionResult.builder()
            .databaseDumpFile(databaseDumpFile)
            .plainDumpFile(plainDumpFile)
            .blobs(blobs)
            .manifest(manifest)
            .build();
    }

    private void addFileToZip(ZipOutputStream zipOut, File file, String pathInZip) throws IOException {
        try (FileInputStream fis = new FileInputStream(file)) {
            ZipEntry zipEntry = new ZipEntry(pathInZip);
            zipOut.putNextEntry(zipEntry);

            byte[] buffer = new byte[8192];
            int len;
            while ((len = fis.read(buffer)) > 0) {
                zipOut.write(buffer, 0, len);
            }

            zipOut.closeEntry();
        }
    }

    private void extractFileFromZip(ZipInputStream zipIn, File destination) throws IOException {
        try (FileOutputStream fos = new FileOutputStream(destination)) {
            byte[] buffer = new byte[8192];
            int len;
            while ((len = zipIn.read(buffer)) > 0) {
                fos.write(buffer, 0, len);
            }
        }
    }
}

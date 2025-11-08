package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.service.FolderBackupService.FolderBackupItem;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class ZipService {
    private static final String FOLDERS_DIR = "folders/";

    @Data
    @Builder
    public static class ZipExtractionResult {
        private File databaseDumpFile;
        private File plainDumpFile;
        private List<FolderFileRestorationItem> folderFiles;
    }

    @Data
    @Builder
    public static class FolderFileRestorationItem {
        private String folderPath;
        private String relativePath;
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
        List<FolderBackupItem> folderItems,
        String timestamp,
        int totalRowCount,
        int retentionPeriod,
        int fileCount,
        long filesTotalSize
    ) throws IOException {
        // Filename format: YYYYMMDD-HHMMSS.rowCount.fileCount.filesTotalSize.retention.zip
        String fileName = String.format("%s.%d.%d.%d.%d.zip", timestamp, totalRowCount, fileCount, filesTotalSize, retentionPeriod);
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

            // Add folder files
            for (FolderBackupItem folderItem : folderItems) {
                if (folderItem.getSourceFile() != null && folderItem.getSourceFile().exists()) {
                    // Remove leading slash from folder path to avoid double slashes
                    String folderPath = folderItem.getFolderPath().startsWith("/")
                        ? folderItem.getFolderPath().substring(1)
                        : folderItem.getFolderPath();
                    String pathInZip = FOLDERS_DIR + folderPath + "/" + folderItem.getRelativePath();
                    addFileToZip(zipOut, folderItem.getSourceFile(), pathInZip);
                    log.debug("Added file to ZIP: {}", pathInZip);
                }
            }

        }

        log.info("Successfully created backup ZIP: {} ({} files included)",
            zipFile.getPath(), folderItems.size());
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
        List<FolderFileRestorationItem> folderFiles = new ArrayList<>();

        // Extract all files
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

                if (entryName.startsWith(FOLDERS_DIR)) {
                    // Extract file and derive folder path from ZIP structure
                    extractFileFromZip(zipIn, extractedFile);

                    // Parse folder path and relative path from: folders/folderPath/relativePath
                    // The folderPath might have multiple levels (e.g., tmp/test-uploads)
                    String pathAfterFolders = entryName.substring(FOLDERS_DIR.length());
                    int lastSlash = pathAfterFolders.lastIndexOf('/');
                    if (lastSlash > 0) {
                        String folderPath = "/" + pathAfterFolders.substring(0, lastSlash);
                        String relativePath = pathAfterFolders.substring(lastSlash + 1);

                        folderFiles.add(FolderFileRestorationItem.builder()
                            .folderPath(folderPath)
                            .relativePath(relativePath)
                            .extractedFile(extractedFile)
                            .build());
                        log.debug("Extracted file: {} -> {}/{}", entryName, folderPath, relativePath);
                    }
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

        log.info("Successfully extracted backup ZIP: {} files, {} folder files",
            databaseDumpFile != null ? 1 : 0, folderFiles.size());

        return ZipExtractionResult.builder()
            .databaseDumpFile(databaseDumpFile)
            .plainDumpFile(plainDumpFile)
            .folderFiles(folderFiles)
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

    /**
     * Extracts and returns the pgdump (custom format) file from a backup ZIP.
     * The file is extracted to a temporary location.
     *
     * @param zipFile The backup ZIP file
     * @return The extracted pgdump file (caller is responsible for cleanup)
     * @throws IOException If an I/O error occurs or pgdump file not found
     */
    public File extractPgdumpFile(File zipFile) throws IOException {
        log.info("Extracting pgdump file from ZIP: {}", zipFile.getPath());

        try (ZipInputStream zipIn = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                String entryName = entry.getName();

                // Find the pgdump file (not .sql, not in folders/ directory)
                if (!entry.isDirectory() && !entryName.startsWith(FOLDERS_DIR) && !entryName.endsWith(".sql")) {
                    File tempFile = Files.createTempFile("pgdump-", ".pgdump").toFile();
                    extractFileFromZip(zipIn, tempFile);
                    log.info("Extracted pgdump file to: {}", tempFile.getPath());
                    return tempFile;
                }

                zipIn.closeEntry();
            }
        }

        throw new IOException("Pgdump file not found in backup ZIP");
    }

    /**
     * Extracts and returns the plain SQL file from a backup ZIP.
     * The file is extracted to a temporary location.
     *
     * @param zipFile The backup ZIP file
     * @return The extracted SQL file (caller is responsible for cleanup)
     * @throws IOException If an I/O error occurs or SQL file not found
     */
    public File extractPlainSqlFile(File zipFile) throws IOException {
        log.info("Extracting plain SQL file from ZIP: {}", zipFile.getPath());

        try (ZipInputStream zipIn = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                String entryName = entry.getName();

                // Find the .sql file (not in folders/ directory)
                if (!entry.isDirectory() && !entryName.startsWith(FOLDERS_DIR) && entryName.endsWith(".sql")) {
                    File tempFile = Files.createTempFile("sql-", ".sql").toFile();
                    extractFileFromZip(zipIn, tempFile);
                    log.info("Extracted SQL file to: {}", tempFile.getPath());
                    return tempFile;
                }

                zipIn.closeEntry();
            }
        }

        throw new IOException("Plain SQL file not found in backup ZIP");
    }
}

package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.model.FolderBackupConfig;
import lombok.Builder;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class FolderBackupService {

    @Data
    @Builder
    public static class FolderBackupItem {
        private String folderPath;
        private String relativePath;
        private long size;
        private File sourceFile;
    }

    public List<FolderBackupItem> collectFolders(List<FolderBackupConfig> folderBackupConfigs) {
        List<FolderBackupItem> collectedFiles = new ArrayList<>();

        for (FolderBackupConfig config : folderBackupConfigs) {
            Path folderPath = Paths.get(config.getPath());

            if (!Files.exists(folderPath)) {
                throw new FolderBackupPathException(String.format(
                    "Folder backup path does not exist: '%s'. "
                    + "The PersistentVolumeClaim is likely missing or its mountPath is misconfigured. "
                    + "Verify the PVC is bound and mounted at this path on the backup pod.",
                    config.getPath()));
            }

            if (!Files.isDirectory(folderPath)) {
                throw new FolderBackupPathException(String.format(
                    "Folder backup path is not a directory: '%s'. "
                    + "Check that the configured path points to a directory, not a file.",
                    config.getPath()));
            }

            log.info("Collecting files from folder: {}", config.getPath());

            try (Stream<Path> paths = Files.walk(folderPath)) {
                paths.filter(Files::isRegularFile)
                    .forEach(filePath -> {
                        try {
                            Path relativePath = folderPath.relativize(filePath);
                            long size = Files.size(filePath);

                            FolderBackupItem item = FolderBackupItem.builder()
                                .folderPath(config.getPath())
                                .relativePath(relativePath.toString())
                                .size(size)
                                .sourceFile(filePath.toFile())
                                .build();

                            collectedFiles.add(item);
                            log.debug("Added file: {} from folder {} (size: {} bytes)",
                                relativePath, config.getPath(), size);
                        } catch (IOException e) {
                            log.error("Error reading file: {}", filePath, e);
                        }
                    });
            } catch (IOException e) {
                log.error("Error walking directory: {}", config.getPath(), e);
            }
        }

        log.info("Collected {} files from {} folders", collectedFiles.size(), folderBackupConfigs.size());
        return collectedFiles;
    }

    public long getTotalSize(List<FolderBackupItem> items) {
        return items.stream()
            .mapToLong(FolderBackupItem::getSize)
            .sum();
    }

    public int getTotalFileCount(List<FolderBackupItem> items) {
        return items.size();
    }
}

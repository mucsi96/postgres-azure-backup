package io.github.mucsi96.postgresbackuptool.controller;

import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.service.BackupService;
import io.github.mucsi96.postgresbackuptool.service.DatabaseService;
import io.github.mucsi96.postgresbackuptool.service.DownloadTokenService;
import io.github.mucsi96.postgresbackuptool.service.DownloadTokenService.DownloadTokenInfo;
import io.github.mucsi96.postgresbackuptool.service.ZipService;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class DownloadController {

    private final DownloadTokenService downloadTokenService;
    private final BackupService backupService;
    private final DatabaseService databaseService;
    private final ZipService zipService;

    @GetMapping("/download/{token}")
    ResponseEntity<Resource> download(@PathVariable String token)
            throws IOException, InterruptedException {
        DownloadTokenInfo tokenInfo = downloadTokenService.consumeToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.GONE,
                        "Download link has expired or is invalid"));

        String key = tokenInfo.getKey();
        String type = tokenInfo.getType();

        if ("data-export".equals(type)) {
            File sqlFile = databaseService
                    .createDataOnlyDump(tokenInfo.getDatabaseName());
            try {
                return streamFile(sqlFile,
                        tokenInfo.getDatabaseName() + "-data-export.sql",
                        MediaType.TEXT_PLAIN);
            } catch (IOException e) {
                sqlFile.delete();
                throw e;
            }
        }

        DatabaseConfiguration databaseConfiguration = databaseService
                .getDatabaseConfiguration(tokenInfo.getDatabaseName());

        if ("archive".equals(type)) {
            BackupService.BackupStreamInfo streamInfo = backupService
                    .streamBackup(databaseConfiguration.getPrefix(), key);
            InputStreamResource resource = new InputStreamResource(
                    streamInfo.inputStream());

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + key + "\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .contentLength(streamInfo.contentLength())
                    .body(resource);
        }

        File backupZipFile = backupService
                .downloadBackup(databaseConfiguration.getPrefix(), key);

        return switch (type) {
            case "pgdump" -> {
                File pgdumpFile = zipService.extractPgdumpFile(backupZipFile);
                backupZipFile.delete();
                yield streamFile(pgdumpFile, key.replace(".zip", ".pgdump"),
                        MediaType.APPLICATION_OCTET_STREAM);
            }
            case "sql" -> {
                File sqlFile = zipService.extractPlainSqlFile(backupZipFile);
                backupZipFile.delete();
                yield streamFile(sqlFile, key.replace(".zip", ".sql"),
                        MediaType.TEXT_PLAIN);
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid download type");
        };
    }

    private ResponseEntity<Resource> streamFile(File file, String filename,
            MediaType contentType) throws IOException {
        InputStream cleanupStream = new DeleteOnCloseInputStream(
                new FileInputStream(file), file);
        InputStreamResource resource = new InputStreamResource(cleanupStream);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(contentType)
                .contentLength(file.length())
                .body(resource);
    }

    private static class DeleteOnCloseInputStream extends FilterInputStream {
        private final File file;

        DeleteOnCloseInputStream(InputStream in, File file) {
            super(in);
            this.file = file;
        }

        @Override
        public void close() throws IOException {
            try {
                super.close();
            } finally {
                file.delete();
            }
        }
    }
}

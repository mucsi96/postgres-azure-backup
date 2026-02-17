package io.github.mucsi96.postgresbackuptool.service;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.Data;

@Service
public class DownloadTokenService {

    private static final long TOKEN_TTL_SECONDS = 30;

    private final Map<String, DownloadTokenInfo> tokens = new ConcurrentHashMap<>();

    @Data
    public static class DownloadTokenInfo {
        private final String databaseName;
        private final String key;
        private final String type;
        private final Instant expiresAt;
    }

    public String createToken(String databaseName, String key, String type) {
        String token = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plusSeconds(TOKEN_TTL_SECONDS);
        tokens.put(token, new DownloadTokenInfo(databaseName, key, type, expiresAt));
        return token;
    }

    public Optional<DownloadTokenInfo> consumeToken(String token) {
        DownloadTokenInfo info = tokens.remove(token);
        if (info == null || info.getExpiresAt().isBefore(Instant.now())) {
            return Optional.empty();
        }
        return Optional.of(info);
    }

    @Scheduled(fixedRate = 60000)
    public void cleanupExpiredTokens() {
        Instant now = Instant.now();
        tokens.entrySet().removeIf(entry -> entry.getValue().getExpiresAt().isBefore(now));
    }
}

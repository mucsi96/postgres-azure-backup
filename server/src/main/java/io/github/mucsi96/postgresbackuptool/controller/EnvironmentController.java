package io.github.mucsi96.postgresbackuptool.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class EnvironmentController {
    private final Environment environment;

    @Value("${tenant-id:}")
    private String tenantId;

    @Value("${api-client-id:}")
    private String clientId;

    @Value("${spa-client-id:}")
    private String uiClientId;

    @GetMapping("/environment")
    public ConfigResponse getConfig() {
        return new ConfigResponse(tenantId, uiClientId, clientId,
                environment.matchesProfiles("test"));
    }

    public record ConfigResponse(String tenantId, String clientId,
            String apiClientId, boolean mockAuth) {
    }
}

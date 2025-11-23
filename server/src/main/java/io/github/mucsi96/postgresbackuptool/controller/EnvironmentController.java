package io.github.mucsi96.postgresbackuptool.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class EnvironmentController {
    private final Environment environment;

    @Value("${AZURE_TENANT_ID:}")
    private String tenantId;

    @Value("${AZURE_CLIENT_ID:}")
    private String clientId;

    @Value("${UI_CLIENT_ID:}")
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

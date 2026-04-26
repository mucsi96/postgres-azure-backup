package io.github.mucsi96.postgresbackuptool.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
public class EnvironmentController {

    @Value("${tenant-id:}")
    private String tenantId;

    @Value("${api-client-id:}")
    private String clientId;

    @Value("${spa-client-id:}")
    private String uiClientId;

    @Value("${mock-oauth2-server-uri:}")
    private String mockOAuth2ServerUri;

    @GetMapping("/environment")
    public ConfigResponse getConfig() {
        return new ConfigResponse(tenantId, uiClientId, clientId,
                mockOAuth2ServerUri);
    }

    public record ConfigResponse(String tenantId, String clientId,
            String apiClientId, String mockOAuth2ServerUri) {
    }
}

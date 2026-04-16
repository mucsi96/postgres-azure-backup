import { EnvironmentProviders } from '@angular/core';
import {
  LogLevel,
  provideAuth,
  withAppInitializerAuthCheck,
} from 'angular-auth-oidc-client';
import { EnvironmentConfig } from './environment/environment.config';

export function provideOidcAuth(config: EnvironmentConfig): EnvironmentProviders {
  if (config.mockOAuth2ServerUri) {
    return provideMockOidcConfig(config);
  }

  return provideAzureAdOidcConfig(config);
}

function provideAzureAdOidcConfig(config: EnvironmentConfig): EnvironmentProviders {
  return provideAuth(
    {
      config: {
        authority: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        authWellknownEndpointUrl: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
        redirectUrl: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
        clientId: config.clientId,
        scope: `openid profile offline_access ${config.apiClientId}/readBackups ${config.apiClientId}/createBackup ${config.apiClientId}/cleanupBackups ${config.apiClientId}/restoreBackup ${config.apiClientId}/downloadBackup`,
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
        autoUserInfo: false,
        disableIatOffsetValidation: true,
        logLevel: LogLevel.Debug,
        secureRoutes: ['/api'],
      },
    },
    withAppInitializerAuthCheck()
  );
}

function provideMockOidcConfig(config: EnvironmentConfig): EnvironmentProviders {
  return provideAuth(
    {
      config: {
        authority: `${config.mockOAuth2ServerUri}/default`,
        redirectUrl: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
        clientId: 'mock-client-id',
        scope: 'openid profile',
        responseType: 'code',
        silentRenew: false,
        autoUserInfo: false,
        logLevel: LogLevel.Debug,
        secureRoutes: ['/api'],
      },
    },
    withAppInitializerAuthCheck()
  );
}

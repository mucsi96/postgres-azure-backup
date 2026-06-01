import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  AbstractSecurityStorage,
  DefaultLocalStorageService,
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
  return makeEnvironmentProviders([
    provideAuth(
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
          renewTimeBeforeTokenExpiresInSeconds: 60,
          autoUserInfo: false,
          disableIatOffsetValidation: true,
          // Refresh-token flow returns a new ID token without a fresh nonce
          // (no new authorize call). With autoCleanStateAfterAuthentication
          // the original nonce is also gone, so validating against it always
          // fails with IncorrectNonce - resetting the session and blanking
          // the avatar when the iPhone PWA resumes from background.
          ignoreNonceAfterRefresh: true,
          logLevel: LogLevel.Warn,
          secureRoutes: ['/api'],
        },
      },
      withAppInitializerAuthCheck()
    ),
    { provide: AbstractSecurityStorage, useClass: DefaultLocalStorageService },
  ]);
}

function provideMockOidcConfig(config: EnvironmentConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAuth(
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
          logLevel: LogLevel.Warn,
          secureRoutes: ['/api'],
        },
      },
      withAppInitializerAuthCheck()
    ),
    { provide: AbstractSecurityStorage, useClass: DefaultLocalStorageService },
  ]);
}

import {
  BrowserCacheLocation,
  InteractionType,
  IPublicClientApplication,
  LogLevel,
  PublicClientApplication,
} from '@azure/msal-browser';
import {
  MSAL_GUARD_CONFIG,
  MSAL_INSTANCE,
  MSAL_INTERCEPTOR_CONFIG,
  MsalBroadcastService,
  MsalGuard,
  MsalGuardConfiguration,
  MsalInterceptor,
  MsalInterceptorConfiguration,
  MsalService,
} from '@azure/msal-angular';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { EnvironmentConfig, ENVIRONMENT_CONFIG } from './environment/environment.config';

function loggerCallback(_logLevel: LogLevel, message: string) {
  console.log(message);
}

export function MSALInstanceFactory(config: EnvironmentConfig): IPublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: '/',
    },
    cache: {
      cacheLocation: BrowserCacheLocation.SessionStorage,
    },
    system: {
      allowPlatformBroker: false, // Disables WAM Broker
      loggerOptions: {
        loggerCallback,
        logLevel: LogLevel.Info,
        piiLoggingEnabled: false,
      },
    },
  });
}

export function MSALInterceptorConfigFactory(config: EnvironmentConfig): MsalInterceptorConfiguration {
  const apiScopes = [
    'readBackups',
    'createBackup',
    'cleanupBackups',
    'restoreBackup',
    'downloadBackup',
  ].map((scope) => `${config.apiClientId}/${scope}`);

  const protectedResourceMap = new Map<string, Array<string>>();
  protectedResourceMap.set('https://graph.microsoft.com/v1.0/me', [
    'user.read',
  ]);
  protectedResourceMap.set(
    `${window.location.origin}/*`,
    apiScopes
  );

  return {
    interactionType: InteractionType.Redirect,
    protectedResourceMap,
  };
}

export function MSALGuardConfigFactory(config: EnvironmentConfig): MsalGuardConfiguration {
  const apiScopes = [
    'readBackups',
    'createBackup',
    'cleanupBackups',
    'restoreBackup',
    'downloadBackup',
  ].map((scope) => `${config.apiClientId}/${scope}`);

  return {
    interactionType: InteractionType.Redirect,
    authRequest: {
      scopes: ['user.read', ...apiScopes],
    },
  };
}

export function provideMsalConfig() {
  return [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: MsalInterceptor,
      multi: true,
    },
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory,
      deps: [ENVIRONMENT_CONFIG],
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: MSALGuardConfigFactory,
      deps: [ENVIRONMENT_CONFIG],
    },
    {
      provide: MSAL_INTERCEPTOR_CONFIG,
      useFactory: MSALInterceptorConfigFactory,
      deps: [ENVIRONMENT_CONFIG],
    },
    MsalService,
    MsalGuard,
    MsalBroadcastService,
  ];
}

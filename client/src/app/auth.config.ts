import {
  EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import {
  UserManager,
  UserManagerSettings,
  WebStorageStateStore,
} from 'oidc-client-ts';
import { EnvironmentConfig } from './environment/environment.config';

/**
 * The single oidc-client-ts UserManager instance, built from the runtime
 * EnvironmentConfig fetched before bootstrap. AuthService is the only consumer.
 */
export const USER_MANAGER = new InjectionToken<UserManager>('USER_MANAGER');

export function provideOidcAuth(
  config: EnvironmentConfig
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: USER_MANAGER, useFactory: () => createUserManager(config) },
  ]);
}

export function createUserManager(config: EnvironmentConfig): UserManager {
  return new UserManager(
    config.mockOAuth2ServerUri
      ? buildMockSettings(config)
      : buildAzureAdSettings(config)
  );
}

/**
 * Settings shared by both environments. Everything automatic is turned OFF so
 * the flow holds no surprises: no background renew timer
 * (`automaticSilentRenew`), no session-check iframe (`monitorSession`), no
 * userinfo round-trip (`loadUserInfo` - we read claims from the id_token's
 * `profile`). A failed `signinSilent()` therefore just rejects and leaves the
 * stored user intact; AuthService decides what to do next.
 *
 * Both the user and the transient PKCE state live in localStorage (not
 * sessionStorage) so the `code_verifier`/`state` survive the full-page
 * redirect to the authority on the iOS standalone PWA.
 */
function baseSettings(): Partial<UserManagerSettings> {
  return {
    redirect_uri: window.location.origin,
    post_logout_redirect_uri: window.location.origin,
    response_type: 'code',
    automaticSilentRenew: false,
    monitorSession: false,
    loadUserInfo: false,
    userStore: new WebStorageStateStore({ store: localStorage }),
    stateStore: new WebStorageStateStore({ store: localStorage }),
  };
}

function buildAzureAdSettings(config: EnvironmentConfig): UserManagerSettings {
  return {
    ...baseSettings(),
    authority: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    client_id: config.clientId,
    scope: `openid profile offline_access ${config.apiClientId}/readBackups ${config.apiClientId}/createBackup ${config.apiClientId}/cleanupBackups ${config.apiClientId}/restoreBackup ${config.apiClientId}/downloadBackup`,
  } as UserManagerSettings;
}

function buildMockSettings(config: EnvironmentConfig): UserManagerSettings {
  return {
    ...baseSettings(),
    authority: `${config.mockOAuth2ServerUri}/default`,
    client_id: 'mock-client-id',
    // No offline_access: the mock issues no refresh token, so proactive renewal
    // self-skips (AuthService gates on refresh_token presence).
    scope: 'openid profile',
  } as UserManagerSettings;
}

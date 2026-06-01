import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, EMPTY, forkJoin, fromEvent, merge, tap, throttleTime } from 'rxjs';

/**
 * Keeps the access token fresh on mobile.
 *
 * `angular-auth-oidc-client` schedules silent renewal on a JS timer, but iOS
 * freezes timers (and the whole page) while the app is backgrounded - which on
 * a phone is most of the time. The scheduled renewal therefore never fires and
 * the user returns to an expired token and a forced re-login.
 *
 * This service renews proactively whenever the app comes back to the
 * foreground (the moment iOS un-freezes the page and the user is about to make
 * a request anyway), so the hourly access-token expiry stops being noticeable.
 */
@Injectable({ providedIn: 'root' })
export class TokenRenewalService {
  private readonly oidcSecurityService = inject(OidcSecurityService);
  private readonly destroyRef = inject(DestroyRef);

  init(): void {
    const visible$ = fromEvent(document, 'visibilitychange');
    const focus$ = fromEvent(window, 'focus');
    const online$ = fromEvent(window, 'online');

    merge(visible$, focus$, online$)
      .pipe(
        throttleTime(30_000, undefined, { leading: true, trailing: false }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.renewIfForeground());
  }

  private renewIfForeground(): void {
    if (document.visibilityState !== 'visible') {
      return;
    }

    forkJoin({
      isAuthenticated: this.oidcSecurityService.isAuthenticated(),
      refreshToken: this.oidcSecurityService.getRefreshToken(),
      accessToken: this.oidcSecurityService.getAccessToken(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ isAuthenticated, refreshToken, accessToken }) => {
        const hasRefreshToken = !!refreshToken;
        const hasAccessToken = !!accessToken;

        console.info(
          `[auth] App returned to foreground - refresh token ${
            hasRefreshToken ? 'still present in storage' : 'gone from storage'
          }`,
          JSON.stringify({
            isAuthenticated,
            hasRefreshToken,
            hasAccessToken,
            refreshTokenLength: refreshToken?.length ?? 0,
            // If iOS evicted the storage the whole OIDC entry disappears, not
            // just the refresh token - the surviving key names reveal which.
            storage: snapshotStorageKeys(),
          })
        );

        if (!hasRefreshToken) {
          console.warn(
            '[auth] No refresh token in storage on foreground - silent renewal impossible, full re-authentication will be required'
          );
          return;
        }

        console.info(
          '[auth] Proactively refreshing access token using stored refresh token'
        );
        this.oidcSecurityService
          .forceRefreshSession()
          .pipe(
            tap(() =>
              console.info('[auth] Proactive foreground token refresh completed')
            ),
            catchError((error: unknown) => {
              console.error(
                '[auth] Proactive foreground token refresh failed',
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                })
              );
              return EMPTY;
            }),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe();
      });
  }
}

/**
 * Snapshots which keys currently live in local/session storage (names only,
 * never values). When iOS reclaims storage for a backgrounded PWA the OIDC
 * entry vanishes entirely, so a shrinking/empty key list across foreground
 * events is the fingerprint of eviction rather than a normal token expiry.
 */
function snapshotStorageKeys(): {
  localStorageKeys: string[];
  sessionStorageKeys: string[];
} {
  const keysOf = (store: Storage): string[] => {
    try {
      return Object.keys(store);
    } catch {
      return ['<unavailable>'];
    }
  };

  return {
    localStorageKeys: keysOf(localStorage),
    sessionStorageKeys: keysOf(sessionStorage),
  };
}

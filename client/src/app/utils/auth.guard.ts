import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, of, switchMap, take } from 'rxjs';

/**
 * Gates the app on a valid session and, before falling back to a full
 * re-authentication redirect, makes one explicit silent-renewal attempt using
 * any refresh token still in storage. This is the single chokepoint where the
 * "we are about to send the user to the authority" decision is made, so it is
 * also where the corresponding logs live.
 */
export const authGuard: CanActivateFn = () => {
  const oidc = inject(OidcSecurityService);

  return oidc.isAuthenticated().pipe(
    take(1),
    switchMap((isAuthenticated) => {
      if (isAuthenticated) {
        return of(true);
      }

      return oidc.getRefreshToken().pipe(
        take(1),
        switchMap((refreshToken) => {
          if (!refreshToken) {
            console.info(
              '[auth] Full re-authentication started - not authenticated and no refresh token in storage'
            );
            oidc.authorize();
            return of(false);
          }

          console.info(
            '[auth] Not authenticated but refresh token present - attempting silent renewal before full re-authentication'
          );
          return oidc.forceRefreshSession().pipe(
            switchMap((result) => {
              if (result.isAuthenticated) {
                console.info(
                  '[auth] Silent renewal recovered the session - skipping full re-authentication'
                );
                return of(true);
              }
              console.warn(
                '[auth] Full re-authentication started - silent renewal did not authenticate'
              );
              oidc.authorize();
              return of(false);
            }),
            catchError((error: unknown) => {
              console.warn(
                '[auth] Full re-authentication started - silent renewal failed',
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                })
              );
              oidc.authorize();
              return of(false);
            })
          );
        })
      );
    })
  );
};

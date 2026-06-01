import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { catchError, switchMap, tap, throwError } from 'rxjs';

const isApiRequest = (url: string): boolean => /\/api(\/|$)/.test(url);

/**
 * Recovers from an expired access token without forcing a full re-login.
 *
 * If a request to the API comes back 401 (typically because the token expired
 * while the app was backgrounded on mobile), silently refresh the session and
 * retry the request once. Only if that retry also fails does the error
 * propagate to the error interceptor.
 *
 * Sits outside the bearer-token interceptor so the retried request is re-issued
 * with the freshly refreshed token, and inside the error interceptor so a
 * successful retry never surfaces a spurious error notification.
 */
export const authRetryInterceptor: HttpInterceptorFn = (req, next) => {
  const oidcSecurityService = inject(OidcSecurityService);

  return next(req).pipe(
    catchError((error: unknown) => {
      const is401 = error instanceof HttpErrorResponse && error.status === 401;

      if (!is401 || !isApiRequest(req.url)) {
        return throwError(() => error);
      }

      console.warn(
        '[auth] API request returned 401 - refreshing token via refresh token and retrying',
        JSON.stringify({ url: req.url })
      );

      return oidcSecurityService.forceRefreshSession().pipe(
        tap(() =>
          console.info(
            '[auth] Token refreshed after 401 - retrying original request',
            JSON.stringify({ url: req.url })
          )
        ),
        switchMap(() => next(req))
      );
    })
  );
};

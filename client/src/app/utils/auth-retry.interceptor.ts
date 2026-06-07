import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from '../auth.service';

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
  const auth = inject(AuthService);

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

      return from(auth.refresh('http-401')).pipe(
        tap((result) =>
          console.info(
            '[auth] Token refreshed after 401 - retrying original request',
            JSON.stringify({
              url: req.url,
              isAuthenticated: !!result && !result.expired,
            })
          )
        ),
        catchError((refreshError: unknown) => {
          console.warn(
            '[auth] Token refresh after 401 failed - propagating original error',
            JSON.stringify({
              url: req.url,
              error:
                refreshError instanceof Error
                  ? refreshError.message
                  : String(refreshError),
            })
          );
          return throwError(() => error);
        }),
        switchMap(() => next(req))
      );
    })
  );
};

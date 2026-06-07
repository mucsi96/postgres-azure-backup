import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth.service';

const isApiRequest = (url: string): boolean => /\/api(\/|$)/.test(url);

/**
 * Attaches the current access token as a Bearer header to API requests.
 * Replaces the bearer-token interceptor the old library shipped; reading the
 * token straight from AuthService keeps token handling in our own code.
 *
 * The token may be expired here - the authRetryInterceptor (which wraps this
 * one) catches the resulting 401, refreshes, and retries with a fresh token.
 */
export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getAccessToken();

  if (!isApiRequest(req.url) || !token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

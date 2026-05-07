import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  MAT_RIPPLE_GLOBAL_OPTIONS,
  RippleGlobalOptions,
} from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from 'angular-auth-oidc-client';
import { provideOidcAuth } from './auth.config';
import { EnvironmentConfig, ENVIRONMENT_CONFIG } from './environment/environment.config';
import { errorInterceptor } from './utils/error.interceptor';

const globalRippleConfig: RippleGlobalOptions = {
  disabled: true,
};

export function getAppConfig(environment: EnvironmentConfig): ApplicationConfig {
  return {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes),
      { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: globalRippleConfig },
      provideAnimationsAsync(),
      provideHttpClient(
        withFetch(),
        withInterceptors([authInterceptor(), errorInterceptor])
      ),
      { provide: ENVIRONMENT_CONFIG, useValue: environment },
      provideOidcAuth(environment),
    ],
  };
}

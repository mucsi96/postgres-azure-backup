import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideAngularMaterialTheme } from '@mucsi96/angular-material-theme';
import { routes } from './app.routes';
import { AuthService } from './auth.service';
import { provideOidcAuth } from './auth.config';
import { EnvironmentConfig, ENVIRONMENT_CONFIG } from './environment/environment.config';
import { authRetryInterceptor } from './utils/auth-retry.interceptor';
import { errorInterceptor } from './utils/error.interceptor';
import { tokenInterceptor } from './utils/token.interceptor';

export function getAppConfig(environment: EnvironmentConfig): ApplicationConfig {
  return {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes),
      provideAnimationsAsync(),
      provideAngularMaterialTheme(),
      provideHttpClient(
        withFetch(),
        withInterceptors([
          errorInterceptor,
          authRetryInterceptor,
          tokenInterceptor,
        ])
      ),
      { provide: ENVIRONMENT_CONFIG, useValue: environment },
      provideOidcAuth(environment),
      provideAppInitializer(() => inject(AuthService).init()),
    ],
  };
}

import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import {
  ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideAngularMaterialTheme } from '@mucsi96/angular-material-theme';
import { routes } from './app.routes';
import { errorInterceptor } from './utils/error.interceptor';

export const appConfig: ApplicationConfig = {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideRouter(routes),
      provideAnimationsAsync(),
      provideAngularMaterialTheme(),
      provideHttpClient(
        withFetch(),
        withXsrfConfiguration({ cookieName: '__Host-XSRF-TOKEN' }),
        withInterceptors([
          errorInterceptor,
        ])
      ),
    ],
};

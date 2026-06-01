import { computed, inject, Injectable } from '@angular/core';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import { OidcSecurityService } from 'angular-auth-oidc-client';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly notifications = inject(NotificationsService);
  private readonly oidcSecurityService = inject(OidcSecurityService);

  readonly isAuthenticated = computed(
    () => this.oidcSecurityService.authenticated().isAuthenticated
  );

  readonly userData = this.oidcSecurityService.userData;

  login(): void {
    console.info('[auth] Full re-authentication started (redirect to authority)');
    this.oidcSecurityService.authorize();
  }

  logout(): void {
    console.info('[auth] Logout started');
    this.oidcSecurityService
      .logoff()
      .subscribe({
        error: (err) => this.showError(err),
      });
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.notifications.error('An error occurred. ' + message);
  }
}

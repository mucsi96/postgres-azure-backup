import { computed, inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OidcSecurityService } from 'angular-auth-oidc-client';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly oidcSecurityService = inject(OidcSecurityService);

  readonly isAuthenticated = computed(
    () => this.oidcSecurityService.authenticated().isAuthenticated
  );

  readonly userData = this.oidcSecurityService.userData;

  login(): void {
    this.oidcSecurityService.authorize();
  }

  logout(): void {
    this.oidcSecurityService
      .logoff()
      .subscribe({
        error: (err) => this.showError(err),
      });
  }

  private showError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.snackBar.open('An error occurred. ' + message, 'Close', {
      duration: 3000,
      verticalPosition: 'top',
      panelClass: ['error'],
    });
  }
}

import { effect, inject, Injectable, Signal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MsalBroadcastService, MsalService } from '@azure/msal-angular';
import {
  AuthenticationResult,
  EventMessage,
  EventType,
  InteractionStatus,
} from '@azure/msal-browser';
import { filter } from 'rxjs';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly config = inject(ENVIRONMENT_CONFIG);
  private readonly snackBar = inject(MatSnackBar);
  readonly mockAuth = this.config.mockAuth;
  readonly msalService = !this.mockAuth
    ? inject(MsalService)
    : undefined;
  private readonly msalBroadcastService = !this.mockAuth
    ? inject(MsalBroadcastService)
    : undefined;
  readonly isAuthenticated = signal(
    this.mockAuth ||
    (this.msalService?.instance.getAllAccounts().length ?? 0) > 0
  );

  private readonly loginSuccess: Signal<EventMessage | undefined> = this.msalBroadcastService
    ? toSignal(
        this.msalBroadcastService.msalSubject$.pipe(
          filter((msg: EventMessage) => msg.eventType === EventType.LOGIN_SUCCESS)
        )
      )
    : signal(undefined);

  private readonly acquireTokenFailure: Signal<EventMessage | undefined> = this.msalBroadcastService
    ? toSignal(
        this.msalBroadcastService.msalSubject$.pipe(
          filter((msg: EventMessage) => msg.eventType === EventType.ACQUIRE_TOKEN_FAILURE)
        )
      )
    : signal(undefined);

  private readonly interactionIdle: Signal<InteractionStatus | undefined> = this.msalBroadcastService
    ? toSignal(
        this.msalBroadcastService.inProgress$.pipe(
          filter((status: InteractionStatus) => status === InteractionStatus.None)
        )
      )
    : signal(undefined);

  constructor() {
    effect(() => {
      const result = this.loginSuccess();
      if (result) {
        const payload = result.payload as AuthenticationResult;
        this.msalService?.instance.setActiveAccount(payload.account);
        this.isAuthenticated.set(true);
      }
    });

    effect(() => {
      const event = this.acquireTokenFailure();
      if (event) {
        this.showError(event.error);
      }
    });

    effect(() => {
      const status = this.interactionIdle();
      if (
        status === InteractionStatus.None &&
        this.msalService &&
        this.msalService.instance.getAllAccounts().length > 0
      ) {
        this.isAuthenticated.set(true);
      }
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

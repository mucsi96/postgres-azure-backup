import { Injectable, inject, linkedSignal } from '@angular/core';
import { AuthService } from './auth.service';

interface UserProfile {
  name: string;
  initials: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly authService = inject(AuthService);

  // Derive the profile from the auth user data, but keep the last known value
  // while the user data is momentarily empty during a token renewal (which
  // happens when the installed PWA resumes on mobile). A plain computed would
  // blank out and make the avatar disappear; linkedSignal lets us fall back to
  // the previous value instead.
  profile = linkedSignal<unknown, UserProfile | undefined>({
    source: this.authService.userData,
    computation: (profile, previous) => {
      const claims = profile as
        | { name?: string; preferred_username?: string }
        | null
        | undefined;
      const name = claims?.name ?? claims?.preferred_username;

      if (!name) {
        return previous?.value;
      }

      return {
        name,
        initials: this.getInitials(name),
      };
    },
  });

  private getInitials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }
}

import { computed, Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly authService = inject(AuthService);

  profile = computed(() => {
    const userDataResult = this.authService.userData();
    const userData = userDataResult?.userData;
    const name = userData?.name ?? userData?.preferred_username;

    if (!name) {
      return undefined;
    }

    return {
      name,
      initials: this.getInitials(name),
    };
  });

  private getInitials(name: string | undefined): string {
    if (!name) return '';
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('');
    return initials.toUpperCase();
  }
}

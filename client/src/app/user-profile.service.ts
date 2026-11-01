import { computed, Injectable } from '@angular/core';
import { httpResource } from '@angular/common/http';

interface UserInfo {
  email: string;
  additionalClaims?: { name?: string };
}

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly userInfo = httpResource<UserInfo>(() => '/oauth2/userinfo');

  readonly profile = computed(() => {
    const user = this.userInfo.value();
    if (!user) return undefined;
    const name = user.additionalClaims?.name ?? user.email;
    return {
      name,
      initials: name.split(' ').map(part => part[0]).join('').toUpperCase(),
    };
  });
}

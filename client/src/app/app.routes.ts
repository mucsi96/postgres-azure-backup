import { CanActivateFn, Routes } from '@angular/router';
import { MsalGuard } from '@azure/msal-angular';
import { DatabaseComponent } from './database/database.component';
import { DatabasesComponent } from './databases/databases.component';
import { inject } from '@angular/core';
import { ENVIRONMENT_CONFIG } from './environment/environment.config';

// Guard factory that checks if auth is needed
const conditionalAuthGuard: CanActivateFn = (route, state) => {
  const { mockAuth } = inject(ENVIRONMENT_CONFIG);

  if (mockAuth) {
    return true;
  }

  const msalGuard = inject(MsalGuard);
  return msalGuard.canActivate(route, state);
};

export const routes: Routes = [
  {
    path: '',
    component: DatabasesComponent,
    canActivate: [conditionalAuthGuard],
  },
  {
    path: 'database/:name',
    component: DatabaseComponent,
    canActivate: [conditionalAuthGuard],
  },
];

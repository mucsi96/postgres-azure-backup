import { Routes } from '@angular/router';
import { DatabaseComponent } from './database/database.component';
import { DatabasesComponent } from './databases/databases.component';
import { autoLoginPartialRoutesGuard } from 'angular-auth-oidc-client';

export const routes: Routes = [
  {
    path: '',
    component: DatabasesComponent,
    canActivate: [autoLoginPartialRoutesGuard],
  },
  {
    path: 'database/:name',
    component: DatabaseComponent,
    canActivate: [autoLoginPartialRoutesGuard],
  },
];

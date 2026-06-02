import { Routes } from '@angular/router';
import { DatabaseComponent } from './database/database.component';
import { DatabasesComponent } from './databases/databases.component';
import { authGuard } from './utils/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: DatabasesComponent,
    canActivate: [authGuard],
  },
  {
    path: 'database/:name',
    component: DatabaseComponent,
    canActivate: [authGuard],
  },
];

import { inject, Injectable, resource } from '@angular/core';
import { ErrorNotificationEvent } from '@mucsi96/ui-elements';
import { Database } from '../../types';
import { fetchJson } from '../utils/fetchJson';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class DatabasesService {
  private readonly http = inject(HttpClient);
  readonly databases = resource<Database[], {}>({
    loader: async () => {
      try {
        const response = await fetchJson<Database[]>(
          this.http,
          '/api/databases'
        );
        return response.map((db) => ({
          ...db,
          lastBackupTime: db.lastBackupTime && new Date(db.lastBackupTime),
        }));
      } catch (error) {
        dispatchEvent(new ErrorNotificationEvent('Could not get databases.'));
        return [];
      }
    },
  });
}

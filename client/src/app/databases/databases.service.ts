import { inject, Injectable, resource, signal } from '@angular/core';
import {
  ErrorNotificationEvent,
  SuccessNotificationEvent,
} from '@mucsi96/ui-elements';
import { Database } from '../../types';
import { fetchJson } from '../utils/fetchJson';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class DatabasesService {
  private readonly http = inject(HttpClient);
  readonly processing = signal(false);
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

  async smartBackup() {
    try {
      this.processing.set(true);
      await fetchJson<void>(this.http, '/api/smart-backup', { method: 'post' });
      document.dispatchEvent(
        new SuccessNotificationEvent('Smart backup completed')
      );
    } catch (error) {
      dispatchEvent(new ErrorNotificationEvent('Could not run smart backup.'));
    }
    this.processing.set(false);
    this.databases.reload();
  }
}

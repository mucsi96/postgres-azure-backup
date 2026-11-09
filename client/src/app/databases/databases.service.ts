import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource, signal } from '@angular/core';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import { Database } from '../../types';
import { fetchJson } from '../utils/fetchJson';

@Injectable({
  providedIn: 'root',
})
export class DatabasesService {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(NotificationsService);
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
      } catch {
        return [];
      }
    },
  });

  async smartBackup() {
    try {
      this.processing.set(true);
      await fetchJson<void>(this.http, '/api/smart-backup', { method: 'post' });
      this.notifications.success('Smart backup completed');
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
    this.databases.reload();
  }

  async backupAll() {
    try {
      this.processing.set(true);
      await fetchJson<void>(this.http, '/api/backup-all', { method: 'post' });
      this.notifications.success('Backup completed');
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
    this.databases.reload();
  }
}

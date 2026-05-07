import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Database } from '../../types';
import { fetchJson } from '../utils/fetchJson';

@Injectable({
  providedIn: 'root',
})
export class DatabasesService {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
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
      this.snackBar.open('Smart backup completed', 'Close', {
        duration: 3000,
        verticalPosition: 'top',
      });
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
    this.databases.reload();
  }
}

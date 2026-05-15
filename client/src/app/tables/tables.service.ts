import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource, signal } from '@angular/core';
import { NotificationsService } from '@mucsi96/angular-material-theme';
import { Table } from '../../types';
import { SelectedDatabaseService } from '../database/selected-database.service';
import { fetchJson } from '../utils/fetchJson';

@Injectable({
  providedIn: 'root',
})
export class TablesService {
  private readonly http = inject(HttpClient);
  private readonly selectedDatabaseService = inject(SelectedDatabaseService);
  private readonly notifications = inject(NotificationsService);
  readonly processing = signal(false);
  readonly tables = resource<
    {
      tables: Table[];
      totalRowCount: number;
      fileCount: number;
    },
    { databaseName?: string }
  >({
    params: () => ({
      databaseName: this.selectedDatabaseService.databaseName(),
    }),
    loader: async ({ params: { databaseName } }) => {
      if (!databaseName) {
        return { tables: [], totalRowCount: 0, fileCount: 0 };
      }
      try {
        const response = await fetchJson<{
          tables: Table[];
          totalRowCount: number;
          fileCount: number;
        }>(this.http, `/api/database/${databaseName}/tables`);
        return response;
      } catch {
        return { tables: [], totalRowCount: 0, fileCount: 0 };
      }
    },
  });

  async createBackup() {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      this.processing.set(true);
      await fetchJson<void>(
        this.http,
        `/api/database/${databaseName}/backup`,
        { method: 'post' }
      );
      this.notifications.success('Backup created');
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
    this.tables.reload();
  }

  async restoreBackup(selectedBackup: string) {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      this.processing.set(true);
      await fetchJson<void>(
        this.http,
        `/api/database/${databaseName}/restore/${selectedBackup}`,
        { method: 'post' }
      );
      this.notifications.success('Backup restored');
      this.tables.reload();
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
    this.tables.reload();
  }

  async exportSql() {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      this.processing.set(true);
      const { token } = await fetchJson<{ token: string }>(
        this.http,
        `/api/database/${databaseName}/export-sql/download-token`,
        { method: 'post' }
      );

      window.open(`/api/download/${token}`, '_self');
    } catch {
      // Error toast is shown by the global error interceptor.
    }
    this.processing.set(false);
  }

  async downloadBackup(
    selectedBackup: string,
    type: 'plain' | 'archive' | 'pgdump'
  ) {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      const downloadType =
        type === 'plain' ? 'sql' : type === 'pgdump' ? 'pgdump' : 'archive';

      const { token } = await fetchJson<{ token: string }>(
        this.http,
        `/api/database/${databaseName}/backup/${selectedBackup}/${downloadType}/download-token`,
        { method: 'post' }
      );

      window.open(`/api/download/${token}`, '_self');
    } catch {
      // Error toast is shown by the global error interceptor.
    }
  }
}

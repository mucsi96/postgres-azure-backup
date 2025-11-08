import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource, signal } from '@angular/core';
import {
  ErrorNotificationEvent,
  SuccessNotificationEvent,
} from '@mucsi96/ui-elements';
import { environment } from '../../environments/environment';
import { Table } from '../../types';
import { SelectedDatabaseService } from '../database/selected-database.service';
import { downloadBlob } from '../utils/downloadBlob';
import { fetchJson } from '../utils/fetchJson';

@Injectable({
  providedIn: 'root',
})
export class TablesService {
  private readonly http = inject(HttpClient);
  private readonly selectedDatabaseService = inject(SelectedDatabaseService);
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
        }>(
          this.http,
          environment.apiContextPath + `/database/${databaseName}/tables`
        );
        return response;
      } catch (error) {
        dispatchEvent(new ErrorNotificationEvent('Could not get tables.'));
        return { tables: [], totalRowCount: 0, fileCount: 0 };
      }
    },
  });

  async restoreBackup(selectedBackup: string) {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      this.processing.set(true);
      await fetchJson<void>(
        this.http,
        environment.apiContextPath +
          `/database/${databaseName}/restore/${selectedBackup}`,
        { method: 'post' }
      );
      document.dispatchEvent(new SuccessNotificationEvent('Backup restored'));
      this.tables.reload();
    } catch (error) {
      dispatchEvent(new ErrorNotificationEvent('Could not restore backup.'));
    }
    this.processing.set(false);
    this.tables.reload();
  }

  async downloadBackup(selectedBackup: string, type: 'plain' | 'archive' | 'pgdump') {
    const databaseName = this.selectedDatabaseService.databaseName();
    if (!databaseName) {
      return;
    }
    try {
      let downloadUrl: string;
      let filename: string;

      // Use new streaming endpoints for all download types
      if (type === 'pgdump') {
        downloadUrl = environment.apiContextPath +
          `/database/${databaseName}/backup/${selectedBackup}/pgdump`;
        filename = selectedBackup.replace('.zip', '.pgdump');
      } else if (type === 'plain') {
        downloadUrl = environment.apiContextPath +
          `/database/${databaseName}/backup/${selectedBackup}/sql`;
        filename = selectedBackup.replace('.zip', '.sql');
      } else {
        downloadUrl = environment.apiContextPath +
          `/database/${databaseName}/backup/${selectedBackup}/archive`;
        filename = selectedBackup;
      }

      // Use HttpClient to make authenticated request and download blob
      await downloadBlob(this.http, downloadUrl, filename);
    } catch (error) {
      dispatchEvent(new ErrorNotificationEvent('Could not download backup.'));
    }
  }

}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource } from '@angular/core';
import { ErrorNotificationEvent } from '@mucsi96/ui-elements';
import { Backup } from '../../types';
import { SelectedDatabaseService } from '../database/selected-database.service';
import { fetchJson } from '../utils/fetchJson';

@Injectable({
  providedIn: 'root',
})
export class BackupsService {
  private readonly http = inject(HttpClient);
  private readonly selectedDatabaseService = inject(SelectedDatabaseService);

  readonly backups = resource<Backup[], { databaseName?: string }>({
    params: () => ({
      databaseName: this.selectedDatabaseService.databaseName(),
    }),
    loader: async ({ params: { databaseName } }) => {
      if (!databaseName) {
        return [];
      }
      try {
        const backups = await fetchJson<Backup[]>(
          this.http,
          `/api/database/${databaseName}/backups`
        );

        return backups.map((backup) => ({
          ...backup,
          lastModified: new Date(backup.lastModified),
        }));
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Could not get backups.';
        document.dispatchEvent(new ErrorNotificationEvent(message));
        return [];
      }
    },
  });
  readonly lastBackupTime = resource<
    Date | undefined,
    { databaseName?: string }
  >({
    params: () => ({
      databaseName: this.selectedDatabaseService.databaseName(),
    }),
    loader: async ({ params: { databaseName } }) => {
      if (!databaseName) {
        return undefined;
      }
      try {
        const lastBackupTime = await fetchJson<Date | undefined>(
          this.http,
          `/api/database/${databaseName}/last-backup-time`
        );

        return lastBackupTime && new Date(lastBackupTime);
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Could not get last backup time.';
        document.dispatchEvent(new ErrorNotificationEvent(message));
        return undefined;
      }
    },
  });
}

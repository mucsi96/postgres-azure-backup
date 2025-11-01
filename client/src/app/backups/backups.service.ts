import { HttpClient } from '@angular/common/http';
import { inject, Injectable, resource } from '@angular/core';
import { ErrorNotificationEvent } from '@mucsi96/ui-elements';
import { environment } from '../../environments/environment';
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
          environment.apiContextPath + `/database/${databaseName}/backups`
        );

        return backups.map((backup) => ({
          ...backup,
          lastModified: new Date(backup.lastModified),
        }));
      } catch (error) {
        dispatchEvent(new ErrorNotificationEvent('Could not get backups.'));
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
          environment.apiContextPath +
            `/database/${databaseName}/last-backup-time`
        );

        return lastBackupTime && new Date(lastBackupTime);
      } catch (error) {
        dispatchEvent(
          new ErrorNotificationEvent('Could not get last backup time.')
        );
        return undefined;
      }
    },
  });
}

import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ErrorNotificationEvent,
  SuccessNotificationEvent,
} from '@mucsi96/ui-elements';
import {
  BehaviorSubject,
  filter,
  finalize,
  map,
  Observable,
  shareReplay,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { Backup } from '../../types';
import { handleError } from '../utils/handleError';

@Injectable({
  providedIn: 'root',
})
export class BackupsService {
  $databaseName = new BehaviorSubject<string | undefined>(undefined);
  $lastBackupTime: Observable<Date | undefined>;
  $backups: Observable<Backup[]>;
  $backupMutations = new BehaviorSubject<void>(undefined);
  loading = signal(true);
  processing = signal(false);

  constructor(private readonly http: HttpClient) {
    this.$backups = this.$databaseName.pipe(
      filter((databaseName) => !!databaseName),
      switchMap((databaseName) =>
        this.$backupMutations.pipe(
          tap(() => this.loading.set(true)),
          switchMap(() =>
            this.http
              .get<Backup[]>(
                environment.apiContextPath + `/database/${databaseName}/backups`
              )
              .pipe(
                map((backups) =>
                  backups.map((backup) => ({
                    ...backup,
                    lastModified: new Date(backup.lastModified),
                  }))
                ),
                handleError('Could not fetch backups.'),
                shareReplay(1),
                finalize(() => this.loading.set(false))
              )
          )
        )
      )
    );
    this.$lastBackupTime = this.$databaseName.pipe(
      filter((databaseName) => !!databaseName),
      switchMap((databaseName) =>
        this.$backupMutations.pipe(
          switchMap(() =>
            this.http
              .get<Date | undefined>(
                environment.apiContextPath +
                  `/database/${databaseName}/last-backup-time`
              )
              .pipe(
                map(
                  (lastBackupTime) => lastBackupTime && new Date(lastBackupTime)
                ),
                handleError('Unable to fetch last backup time'),
                shareReplay(1)
              )
          )
        )
      )
    );
  }

  setDatabaseName(databaseName: string) {
    this.$databaseName.next(databaseName);
  }

  getLastBackupTime() {
    return toSignal(this.$lastBackupTime);
  }

  getBackups() {
    return toSignal(this.$backups);
  }

  isLoading() {
    return this.loading;
  }

  createBackup(retentionPeriod: number) {
    this.$databaseName
      .pipe(
        tap(() => this.processing.set(true)),
        switchMap((databaseName) =>
          this.http
            .post<void>(
              environment.apiContextPath +
                `/database/${databaseName}/backup?retention_period=${retentionPeriod}`,
              {}
            )
            .pipe(
              handleError('Could not create backup.'),
              tap(() => {
                document.dispatchEvent(
                  new SuccessNotificationEvent('Backup created')
                );
                this.$backupMutations.next();
              }),
              finalize(() => this.processing.set(false))
            )
        )
      )
      .subscribe();
  }

  cleanupBackups() {
    this.$databaseName
      .pipe(
        tap(() => this.processing.set(true)),
        switchMap((databaseName) =>
          this.http
            .post<void>(
              environment.apiContextPath + `/database/${databaseName}/cleanup`,
              {}
            )
            .pipe(
              handleError('Could not cleanup backups'),
              tap(() => {
                document.dispatchEvent(
                  new SuccessNotificationEvent('Backup cleanup finished')
                );
                this.$backupMutations.next();
              }),
              finalize(() => this.processing.set(false))
            )
        )
      )
      .subscribe();
  }

  isProcessing() {
    return this.processing;
  }
}

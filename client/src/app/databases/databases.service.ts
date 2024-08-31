import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  distinctUntilChanged,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { handleError } from '../utils/handleError';
import { Database } from '../../types';
import { TablesService } from '../tables/tables.service';
import { BackupsService } from '../backups/backups.service';

@Injectable({
  providedIn: 'root',
})
export class DatabasesService {
  private $databases: Observable<Database[]>;
  private readonly selectedDatabase = signal<string | undefined>(undefined);
  private readonly loading = signal(true);

  constructor(
    private readonly http: HttpClient,
    tableService: TablesService,
    backupsService: BackupsService
  ) {
    this.$databases = merge(
      of(null),
      tableService.getTableMutations(),
      backupsService.getBackupMutations()
    ).pipe(
      distinctUntilChanged(),
      tap(() => this.loading.set(true)),
      switchMap(() =>
        this.http
          .get<Database[]>(environment.apiContextPath + '/databases')
          .pipe(
            handleError('Could not fetch databases'),
            map((databases) =>
              databases.map((db) => ({
                ...db,
                lastBackupTime: new Date(db.lastBackupTime),
              }))
            ),
            tap(() => this.loading.set(false))
          )
      ),
      shareReplay(1)
    );
  }

  getSelectedDatabase() {
    return this.selectedDatabase;
  }

  setDatabaseName(name: string | undefined) {
    this.selectedDatabase.set(name);
  }

  getDatabases() {
    return toSignal(this.$databases);
  }

  isLoading() {
    return this.loading;
  }
}

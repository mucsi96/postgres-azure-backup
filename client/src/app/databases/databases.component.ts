import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { Database } from '../../types';
import { olderThenOneDay } from '../utils/dateUtils';
import { RelativeTimePipe } from '../utils/relativeTime.pipe';
import { DatabasesService } from './databases.service';

@Component({
  selector: 'app-databases',
  standalone: true,
  imports: [
    RelativeTimePipe,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './databases.component.html',
  styleUrl: './databases.component.css',
})
export class DatabasesComponent {
  private readonly databasesService = inject(DatabasesService);
  private readonly router = inject(Router);
  databases = this.databasesService.databases;
  processing = this.databasesService.processing;
  olderThenOneDay = olderThenOneDay;

  readonly displayedColumns = [
    'name',
    'tablesCount',
    'totalRowCount',
    'fileCount',
    'backupsCount',
    'lastBackupTime',
  ];

  selectDatabase(database: Database) {
    this.router.navigate(['/database', database.name]);
  }

  async smartBackup() {
    if (this.processing()) {
      return;
    }
    await this.databasesService.smartBackup();
  }
}

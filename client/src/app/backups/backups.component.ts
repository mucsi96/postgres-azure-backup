import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Backup } from '../../types';
import { TablesService } from '../tables/tables.service';
import { RelativeTimePipe } from '../utils/relativeTime.pipe';
import { RetentionPipe } from '../utils/retention.pipe';
import { SizePipe } from '../utils/size.pipe';
import { BackupsService } from './backups.service';

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [
    SizePipe,
    RetentionPipe,
    RelativeTimePipe,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.css',
})
export class BackupsComponent {
  private readonly backupsService = inject(BackupsService);
  private readonly tableService = inject(TablesService);
  backups = this.backupsService.backups;
  processing = this.tableService.processing;
  loading = this.backupsService.backups.isLoading();
  selectedBackup = signal<string | undefined>(undefined);

  readonly displayedColumns = [
    'select',
    'lastModified',
    'totalRowCount',
    'size',
    'fileCount',
    'filesTotalSize',
    'retentionPeriod',
    'actions',
  ];

  restoreBackup() {
    const selectedBackup = this.selectedBackup();

    if (this.processing() || !selectedBackup) {
      return;
    }

    this.tableService.restoreBackup(selectedBackup);
  }

  downloadBackup({ type }: { type: 'plain' | 'archive' | 'pgdump' }) {
    const selectedBackup = this.selectedBackup();

    if (this.processing() || !selectedBackup) {
      return;
    }

    this.tableService.downloadBackup(selectedBackup, type);
  }

  selectBackup(backup: Backup) {
    this.selectedBackup.set(backup.name);
  }
}

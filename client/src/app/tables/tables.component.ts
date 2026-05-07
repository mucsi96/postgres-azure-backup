import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { BackupsService } from '../backups/backups.service';
import { TablesService } from './tables.service';

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTableModule,
  ],
  templateUrl: './tables.component.html',
  styleUrl: './tables.component.css',
})
export class TablesComponent {
  private readonly tabeService = inject(TablesService);
  private readonly backupsService = inject(BackupsService);
  readonly tableData = this.tabeService.tables;
  tables = computed(() => this.tableData.value()?.tables);
  totalRowCount = computed(() => this.tableData.value()?.totalRowCount);
  fileCount = computed(() => this.tableData.value()?.fileCount);
  processing = this.tabeService.processing;

  readonly displayedColumns = ['name', 'rowCount'];

  async createBackup() {
    if (this.processing()) {
      return;
    }
    await this.tabeService.createBackup();
    this.backupsService.backups.reload();
  }

  async exportSql() {
    if (this.processing()) {
      return;
    }
    await this.tabeService.exportSql();
  }
}

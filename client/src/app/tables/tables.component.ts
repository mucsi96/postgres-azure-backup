import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { BarLoaderComponent } from '@mucsi96/angular-material-theme';
import { BackupsService } from '../backups/backups.service';
import { TablesService } from './tables.service';

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [BarLoaderComponent, MatButtonModule],
  templateUrl: './tables.component.html',
  styleUrl: './tables.component.css',
})
export class TablesComponent {
  private readonly tabeService = inject(TablesService);
  private readonly backupsService = inject(BackupsService);
  readonly tableData = this.tabeService.tables;
  tables = computed(() => this.tableData.value()?.tables);
  totalRowCount = computed(
    () => this.tableData.value()?.totalRowCount
  );
  fileCount = computed(
    () => this.tableData.value()?.fileCount
  );
  processing = this.tabeService.processing;

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

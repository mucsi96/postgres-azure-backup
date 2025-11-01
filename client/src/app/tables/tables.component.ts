import { Component, computed, inject } from '@angular/core';
import { TablesService } from './tables.service';

@Component({
  selector: 'app-tables',
  standalone: true,
  templateUrl: './tables.component.html',
  styleUrl: './tables.component.css',
})
export class TablesComponent {
  private readonly tabeService = inject(TablesService);
  readonly tableData = this.tabeService.tables;
  tables = computed(() => this.tableData.value()?.tables);
  totalRowCount = computed(
    () => this.tableData.value()?.totalRowCount
  );
  blobCount = computed(
    () => this.tableData.value()?.blobCount
  );
  processing = this.tabeService.processing;
}

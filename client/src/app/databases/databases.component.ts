import { Component, inject } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import {
  BarLoaderComponent,
  SplitButtonComponent,
} from '@mucsi96/angular-material-theme';
import { Database } from '../../types';
import { olderThenOneDay } from '../utils/dateUtils';
import { RelativeTimePipe } from '../utils/relativeTime.pipe';
import { DatabasesService } from './databases.service';

@Component({
  selector: 'app-databases',
  standalone: true,
  imports: [
    RelativeTimePipe,
    MatMenuModule,
    BarLoaderComponent,
    SplitButtonComponent,
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

  selectDatabase(database: Database) {
    this.router.navigate(['/database', database.name]);
  }

  async backup() {
    if (this.processing()) {
      return;
    }
    await this.databasesService.backupAll();
  }

  async smartBackup() {
    if (this.processing()) {
      return;
    }
    await this.databasesService.smartBackup();
  }
}

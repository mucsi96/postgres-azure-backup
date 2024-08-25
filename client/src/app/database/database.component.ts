import { Component } from '@angular/core';
import { TablesComponent } from '../tables/tables.component';
import { BackupsComponent } from '../backups/backups.component';
import { ActivatedRoute } from '@angular/router';
import { BackupsService } from '../backups/backups.service';
import { TablesService } from '../tables/tables.service';
import { DatabasesService } from '../databases/databases.service';

@Component({
  selector: 'app-database',
  standalone: true,
  imports: [TablesComponent, BackupsComponent],
  templateUrl: './database.component.html',
  styleUrl: './database.component.css',
})
export class DatabaseComponent {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly databasesService: DatabasesService,
    private readonly backupsService: BackupsService,
    private readonly tablesService: TablesService
  ) {
    this.route.params.subscribe((params) => {
      if (params['name']) {
        this.databasesService.setDatabaseName(params['name']);
        this.tablesService.setDatabaseName(params['name']);
        this.backupsService.setDatabaseName(params['name']);
      }
    });
  }
}

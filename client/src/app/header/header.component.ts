import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { BackupsService } from '../backups/backups.service';
import { DatabasesService } from '../databases/databases.service';
import { SelectedDatabaseService } from '../database/selected-database.service';
import { UserProfileService } from '../user-profile.service';
import { olderThenOneDay } from '../utils/dateUtils';
import { RelativeTimePipe } from '../utils/relativeTime.pipe';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RelativeTimePipe, RouterLink, MatButtonModule, MatMenuModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  databaseName = inject(SelectedDatabaseService).databaseName;
  databases = inject(DatabasesService).databases;
  lastBackupTime = inject(BackupsService).lastBackupTime;
  profile = inject(UserProfileService).profile;
  olderThenOneDay = olderThenOneDay;
}

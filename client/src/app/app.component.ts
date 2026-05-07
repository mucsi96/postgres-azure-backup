import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { SelectedDatabaseService } from './database/selected-database.service';
import { HeaderComponent } from './header/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    HeaderComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  selectedDatabaseService = inject(SelectedDatabaseService);
  isAuthenticated = inject(AuthService).isAuthenticated;

  resetSelectedDatabase() {
    this.selectedDatabaseService.resetSelectedDatabase();
  }
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import '@mucsi96/ui-elements';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));

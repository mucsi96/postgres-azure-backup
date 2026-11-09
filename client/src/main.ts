import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initFaro } from './app/utils/faro';
import '@mucsi96/ui-elements';

initFaro(new URL('/_telemetry/collect', window.location.origin).href, 'postgres-azure-backup-client');
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));

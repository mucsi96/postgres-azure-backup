import { bootstrapApplication } from '@angular/platform-browser';
import { getAppConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { EnvironmentConfig } from './app/environment/environment.config';
import '@mucsi96/ui-elements';

// Load configuration before bootstrapping
async function loadEnvironmentConfig(): Promise<EnvironmentConfig> {
  const response = await fetch('/api/environment');
  if (!response.ok) {
    throw new Error(`Failed to load config: ${response.status}`);
  }
  return await response.json();
}

// Bootstrap the application after config is loaded
loadEnvironmentConfig().then((environment) => {
  bootstrapApplication(AppComponent, getAppConfig(environment)).catch((err) =>
    console.error(err)
  );
});

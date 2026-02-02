import { bootstrapApplication } from '@angular/platform-browser';
import { getAppConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { EnvironmentConfig } from './app/environment/environment.config';
import { BrowserUtils } from '@azure/msal-browser';
import '@mucsi96/ui-elements';

if (BrowserUtils.isInPopup() || BrowserUtils.isInIframe()) {
  import('@azure/msal-browser/redirect-bridge').then(({ broadcastResponseToMainFrame }) =>
    broadcastResponseToMainFrame().catch((err) => console.error(err))
  );
} else {
  loadEnvironmentConfig().then(environment => {
    bootstrapApplication(AppComponent, getAppConfig(environment))
      .catch((err) => console.error(err));
  });
}

async function loadEnvironmentConfig(): Promise<EnvironmentConfig> {
  const response = await fetch('/api/environment');
  if (!response.ok) {
    throw new Error(`Failed to load config: ${response.status}`);
  }
  return await response.json();
}

import { InjectionToken } from '@angular/core';

export interface EnvironmentConfig {
  tenantId: string;
  clientId: string;
  apiClientId: string;
  mockAuth: boolean;
}

export const ENVIRONMENT_CONFIG = new InjectionToken<EnvironmentConfig>(
  'ENVIRONMENT_CONFIG'
);

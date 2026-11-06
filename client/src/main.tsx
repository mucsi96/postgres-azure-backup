import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsProvider } from '@mucsi96/react-ui';
import { initializeFaro } from '@grafana/faro-web-sdk';
import '@mucsi96/react-ui/styles.css';
import './styles.css';
import { App } from './App';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

initializeFaro({
  url: new URL('/_telemetry/collect', window.location.origin).href,
  app: { name: 'postgres-azure-backup-client', version: '1.0.0' },
  consoleInstrumentation: { disabledLevels: [] },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <BrowserRouter><App /></BrowserRouter>
      </NotificationsProvider>
    </QueryClientProvider>
  </StrictMode>,
);

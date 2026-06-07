import { faro, initializeFaro, LogLevel } from '@grafana/faro-web-sdk';

// Network sends currently in flight. Populated by wrapping each transport's
// `send` (FetchTransport resolves its promise when the POST settles), so
// flushFaro() can await actual delivery before a redirect navigates away.
const inFlightSends = new Set<Promise<unknown>>();

// Mirrors Faro's DEFAULT_SEND_TIMEOUT_MS - the batch interval we keep.
const FARO_BATCH_INTERVAL_MS = 250;

export function initFaro(clientLogUrl: string, clientAppName: string): void {
  if (!clientLogUrl) {
    return;
  }

  initializeFaro({
    url: clientLogUrl,
    app: {
      name: clientAppName,
      version: '1.0.0',
    },
    // Faro filters out console.log/debug/trace by default; capture every level
    // so the auth/token-renewal traces and any third-party console output land
    // in the backend logs.
    consoleInstrumentation: {
      disabledLevels: [],
    },
    // Keep Faro's default 250 ms batching. Before a full-page redirect we call
    // flushFaro(), which drains the queue and awaits the network sends, so we
    // no longer need to collapse the batch timer to catch that window.
  });

  trackTransportSends();
  installFlushOnHide();
}

/**
 * Wraps each transport's `send` so the promise it returns is tracked. Faro's
 * batch layer calls `send` fire-and-forget and discards the promise; capturing
 * it here is what lets flushFaro() await real delivery.
 */
function trackTransportSends(): void {
  faro?.transports?.transports.forEach((transport) => {
    const originalSend = transport.send.bind(transport);
    transport.send = (items) => {
      const result = originalSend(items);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        const promise = result as Promise<unknown>;
        inFlightSends.add(promise);
        promise.finally(() => inFlightSends.delete(promise));
      }
      return result;
    };
  });
}

/**
 * Awaits delivery of all pending Faro logs, then resolves. Call this before a
 * full-page redirect (signinRedirect/signoutRedirect) so the pre-redirect trace
 * reaches the backend instead of being lost when the page navigates away.
 *
 * Faro 2.x exposes no public flush, so we push a marker, let the 250 ms batch
 * interval dispatch the buffered logs (waiting for the resulting network send),
 * then await every tracked send. Bounded by maxWaitMs so the redirect never
 * hangs if the backend is slow or unreachable.
 */
export async function flushFaro(maxWaitMs = 1500): Promise<void> {
  if (!faro) {
    return;
  }

  faro.api.pushLog(['[faro] flush before redirect'], { level: LogLevel.INFO });

  const deadline = Date.now() + maxWaitMs;

  // 1. Wait for the batch interval to turn the buffered logs into a network
  //    send. The buffer is non-empty (we just pushed), so a flush is due within
  //    one interval.
  while (inFlightSends.size === 0 && Date.now() < deadline) {
    await delay(Math.min(30, FARO_BATCH_INTERVAL_MS));
  }

  // 2. Drain all network sends; later batches may enqueue more as we wait.
  while (inFlightSends.size > 0 && Date.now() < deadline) {
    await Promise.allSettled([...inFlightSends]);
    await delay(0);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Belt-and-suspenders flush on page lifecycle transitions. Faro's batch
 * executor already flushes on visibilitychange=hidden internally; this just
 * adds a marker log showing whether the hide hook fired before a navigation.
 */
function installFlushOnHide(): void {
  const flush = (reason: 'pagehide' | 'visibilitychange'): void => {
    faro?.api?.pushLog([`[faro] flush on ${reason}`], { level: LogLevel.INFO });
  };

  window.addEventListener('pagehide', () => flush('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush('visibilitychange');
    }
  });
}

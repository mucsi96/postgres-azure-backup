import { test, expect } from '../fixtures';

test('serves index.html with no-cache so new deployments are picked up', async ({ request }) => {
  const response = await request.get('/index.html');
  expect(response.headers()['cache-control']).toContain('no-cache');
});

test('serves SPA fallback routes with no-cache', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['cache-control']).toContain('no-cache');
});

test('serves web manifest with no-cache', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.headers()['cache-control']).toContain('no-cache');
});

test('serves hashed bundles with long-lived immutable caching', async ({ request }) => {
  const indexHtml = await (await request.get('/index.html')).text();
  const bundlePaths = [...indexHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
    ([, path]) => path
  );
  expect(bundlePaths.length).toBeGreaterThan(0);

  const responses = await Promise.all(bundlePaths.map((path) => request.get(`/${path}`)));
  responses.forEach((response) => {
    expect(response.headers()['cache-control']).toContain('immutable');
  });
});

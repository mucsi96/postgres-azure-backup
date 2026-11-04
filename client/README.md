# Postgres Backup Tool client

React 19 function components, Vite, strict TypeScript, TanStack Query, Zod and
`@mucsi96/react-ui`. Component layouts use colocated CSS Modules.

Requires Node.js 24 or newer. From this directory:

```sh
npm ci
npm run lint
npm run typecheck
npm run build
```

`npm start` serves Vite on port 8169, proxying `/api`, `/oauth2` and telemetry
to the local gateway on 8160. Local automated tests supply gateway identity
through Playwright fixtures; production authentication belongs to the platform.
`npm run preview` serves the production build on 8169.

Routes are `/` and `/database/:name`. React Router owns navigation; database
query keys include the route name and mutations invalidate affected server
state. API responses are validated with Zod. Failed reads have explicit retry
controls and failed mutations show notifications without automatic replay.

The browser reads `/oauth2/userinfo` and sends the readable
`__Host-XSRF-TOKEN` cookie as `X-XSRF-TOKEN` on same-origin mutations. It never
acquires or stores OAuth credentials. Downloads request a one-time backend token
before navigating to `/api/download/:token`.

`dist/` is the static deployment artifact. Relative bundle/font URLs support
direct Blob hosting; `scripts/prepare-client.mjs` rewrites document asset URLs.
API and Faro URLs resolve against the application origin. The base element
keeps local deep-link asset loading rooted at `/`.

Behavior is covered by Playwright, with no React unit/component tests:

```sh
# From the repository root
scripts/pod_up.sh
node test/static-assets.mjs
cd test && npx playwright test
```

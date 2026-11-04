import { createHash, randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';

export async function apiIdentity(request: APIRequestContext, client = 'test-client') {
  const issuer = 'http://localhost:8166/default';
  const redirect = 'http://localhost/test';
  const verifier = randomBytes(32).toString('base64url');
  const authorization = await request.get(`${issuer}/authorize`, {
    params: {
      client_id: client, redirect_uri: redirect, response_type: 'code',
      scope: 'openid offline_access api-access', state: randomBytes(16).toString('hex'),
      nonce: randomBytes(16).toString('hex'), code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    },
    maxRedirects: 0,
  });
  const location = authorization.headers()['location'];
  if (!location) throw new Error(`Mock authorization failed: ${authorization.status()}`);
  const code = new URL(location).searchParams.get('code')!;
  const tokens = await request.post(`${issuer}/token`, {
    form: { grant_type: 'authorization_code', client_id: client, client_secret: 'test-secret', redirect_uri: redirect, code, code_verifier: verifier },
  });
  if (!tokens.ok()) throw new Error(`Mock token request failed: ${tokens.status()}`);
  return { Authorization: `Bearer ${(await tokens.json()).access_token}` };
}

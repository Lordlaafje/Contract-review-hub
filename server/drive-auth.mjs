/**
 * drive-auth.mjs — one-time Google sign-in to get GOOGLE_REFRESH_TOKEN for drive.mjs.
 *
 *   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm --prefix server run drive-auth
 *
 * Opens nothing by itself: it prints a Google sign-in link, waits on a local port for
 * Google to redirect back, and prints the refresh token. Run it on your own computer
 * (the browser redirect has to reach this script). Asks only for the drive.file scope.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { SCOPE } from './drive.mjs';

const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (OAuth client of type "Desktop app").');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/') { res.writeHead(404).end(); return; }
  const finish = (msg, code = 0) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(msg);
    server.close();
    process.exitCode = code;
  };
  if (url.searchParams.get('state') !== state) return finish('State mismatch — start again.', 1);
  if (url.searchParams.get('error')) return finish('Google returned: ' + url.searchParams.get('error'), 1);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: url.searchParams.get('code') || '',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const out = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !out.refresh_token) {
    console.error('Token exchange failed:', out.error_description || out.error || tokenRes.status);
    return finish('Sign-in failed — see the terminal.', 1);
  }
  console.log('\n✅ Signed in. Add this line to your .env file (keep it secret):\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${out.refresh_token}\n`);
  finish('Done — you can close this tab and go back to the terminal.');
});

let redirectUri = '';
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  console.log('\nOpen this link in your browser and sign in with the Google account whose Drive you want to use:\n');
  console.log(auth.toString() + '\n');
  console.log('Waiting for Google to send you back here…');
});

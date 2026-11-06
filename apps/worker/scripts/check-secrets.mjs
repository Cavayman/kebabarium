// Lists which Worker secrets are set in Cloudflare and which are still missing (values are never printed).
import { execFileSync } from 'node:child_process';

const REQUIRED = ['SESSION_SECRET', 'IP_HASH_SECRET', 'ADMIN_EMAILS'];
const RECOMMENDED = [
  'GOOGLE_PLACES_KEY',
  'GOOGLE_MAPS_BROWSER_KEY',
  'GOOGLE_MAP_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET',
  'THREADS_TOKEN',
];

let names = [];
try {
  const out = execFileSync('npx', ['wrangler', 'secret', 'list', '--format', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  names = JSON.parse(out).map((s) => s.name);
} catch (e) {
  console.error('Could not list secrets — are you logged in (npx wrangler login) and is the worker deployed once?');
  process.exit(2);
}

const row = (n, required) => `${names.includes(n) ? '✓' : required ? '✗' : '·'} ${n}${names.includes(n) ? '' : required ? '  (required)' : '  (feature off until set)'}`;
console.log([...REQUIRED.map((n) => row(n, true)), ...RECOMMENDED.map((n) => row(n, false))].join('\n'));
process.exit(REQUIRED.every((n) => names.includes(n)) ? 0 : 1);

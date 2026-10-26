// Generates an Apple Music developer token (ES256 JWT) from your MusicKit private key.
// Usage: node scripts/apple-token.mjs <TEAM_ID> <KEY_ID> <path/to/AuthKey_KEYID.p8> [days=180]
// Keep the .p8 file private. The token it prints is safe to paste into the app.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const [teamId, keyId, keyPath, days = '180'] = process.argv.slice(2);
if (!teamId || !keyId || !keyPath) {
  console.error('Usage: node scripts/apple-token.mjs <TEAM_ID> <KEY_ID> <AuthKey.p8> [days<=180]');
  process.exit(1);
}
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: keyId };
const payload = { iss: teamId, iat: now, exp: now + Math.min(180, Number(days)) * 86400 };
const input = `${b64url(header)}.${b64url(payload)}`;
const sig = createSign('SHA256').update(input).sign({ key: readFileSync(keyPath), dsaEncoding: 'ieee-p1363' }).toString('base64url');
console.log(`${input}.${sig}`);

// Bumps version.json so open copies of xVIZ show "A new version is ready".
// Usage: node scripts/release.mjs [patch|minor|major]   (default: patch)
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../version.json', import.meta.url);
const part = process.argv[2] || 'patch';
const [maj, min, pat] = JSON.parse(readFileSync(file, 'utf8')).version.split('.').map(Number);
const next = part === 'major' ? [maj + 1, 0, 0] : part === 'minor' ? [maj, min + 1, 0] : [maj, min, pat + 1];
writeFileSync(file, JSON.stringify({ version: next.join('.') }) + '\n');
console.log(`xVIZ ${next.join('.')}`);

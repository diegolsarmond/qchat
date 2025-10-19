import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const configPath = path.join(process.cwd(), 'nginx.conf');
const config = readFileSync(configPath, 'utf-8');

test('nginx config provides SPA fallback', () => {
  assert.match(config, /try_files \$uri(?: \$uri\/)? \/index\.html;/);
});

test('nginx config caches static assets aggressively', () => {
  assert.ok(config.includes('Cache-Control "public, max-age=31536000, immutable"'));
});

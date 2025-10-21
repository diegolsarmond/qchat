import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));

const readEnvProjectId = () => {
  const envPath = resolve(currentDir, '../.env');
  const content = readFileSync(envPath, 'utf-8');
  const match = content.match(/^VITE_SUPABASE_PROJECT_ID\s*=\s*"([^"]*)"$/m);
  assert.ok(match);
  return match[1];
};

const readConfigProjectId = () => {
  const configPath = resolve(currentDir, '../supabase/config.toml');
  const content = readFileSync(configPath, 'utf-8');
  const match = content.match(/^project_id\s*=\s*"([^"]*)"$/m);
  assert.ok(match);
  return match[1];
};

test('config.toml utiliza o mesmo project id definido no .env', () => {
  const envProjectId = readEnvProjectId();
  const configProjectId = readConfigProjectId();
  assert.equal(configProjectId, envProjectId);
});


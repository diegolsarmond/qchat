import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCredentialOwnership } from '../supabase/functions/_shared/credential-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

test('ensureCredentialOwnership rejeita credencial de outro usuário', async () => {
  const result = ensureCredentialOwnership({ id: 'cred-1', user_id: 'user-b' }, 'user-a', corsHeaders);

  assert.ok(result.response);
  assert.equal(result.response?.status, 403);

  const body = await result.response?.json();
  assert.deepEqual(body, { error: 'Acesso não autorizado' });
});

test('ensureCredentialOwnership aceita credencial do usuário autenticado', () => {
  const credential = { id: 'cred-2', user_id: 'user-a' };
  const result = ensureCredentialOwnership(credential, 'user-a', corsHeaders);

  assert.ok(result.credential);
  assert.equal(result.credential, credential);
  assert.equal(result.response, undefined);
});

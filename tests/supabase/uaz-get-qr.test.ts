import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

type HandlerSetup = {
  handler: (req: Request) => Promise<Response>;
  createClientCalls: unknown[][];
  fetchCalls: Request[];
  updates: Array<Record<string, unknown>>;
};

const loadHandler = (options?: {
  supabaseClient?: Record<string, unknown>;
  ensureCredentialOwnership?: (
    credential: unknown,
    userId: string,
    headers: Record<string, string>,
  ) => { credential?: unknown; response?: Response };
  fetchImpl?: typeof fetch;
  env?: Record<string, string>;
}): HandlerSetup => {
  const moduleUrl = new URL('../../supabase/functions/uaz-get-qr/index.ts', import.meta.url);
  const modulePath = fileURLToPath(moduleUrl);
  const source = readFileSync(modulePath, 'utf-8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: modulePath,
  });

  const createClientCalls: unknown[][] = [];
  const fetchCalls: Request[] = [];
  const updates: Array<Record<string, unknown>> = [];

  const env = options?.env ?? {
    SUPABASE_URL: 'http://supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };

  const defaultSupabaseClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
    },
    from(table: string) {
      if (table === 'credentials') {
        return {
          select() {
            return this;
          },
          eq() {
            return {
              single: async () => ({ data: null, error: null }),
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq() {
                return {
                  eq: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      }

      return {
        update() {
          return {
            eq() {
              return {
                eq: async () => ({ data: null, error: null }),
              };
            },
          };
        },
      };
    },
  } satisfies Record<string, unknown>;

  const ensureCredentialOwnership =
    options?.ensureCredentialOwnership ??
    (() => ({
      credential: { subdomain: 'tenant', token: 'token', user_id: 'user-123' },
      response: undefined,
    }));

  const fetchImpl = options?.fetchImpl ?? (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const request = input instanceof Request ? input : new Request(input, init);
    fetchCalls.push(request);
    return new Response(JSON.stringify({ status: { connected: false }, instance: { status: 'disconnected' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  let capturedHandler: ((req: Request) => Promise<Response>) | undefined;

  const customRequire = (specifier: string) => {
    if (specifier === 'https://deno.land/std@0.168.0/http/server.ts') {
      return {
        serve: (fn: (req: Request) => Promise<Response>) => {
          capturedHandler = fn;
        },
      };
    }

    if (specifier === 'https://esm.sh/@supabase/supabase-js@2') {
      return {
        createClient: (...args: unknown[]) => {
          createClientCalls.push(args);
          return (options?.supabaseClient ?? defaultSupabaseClient) as Record<string, unknown>;
        },
      };
    }

    if (specifier === '../_shared/credential-guard.ts') {
      return { ensureCredentialOwnership };
    }

    return require(specifier);
  };

  const script = new vm.Script(outputText, { filename: modulePath });
  const module = { exports: {} as Record<string, unknown> };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    console,
    process,
    Response,
    Request,
    Headers,
    fetch: fetchImpl,
    Deno: {
      env: {
        get: (key: string) => env[key] ?? null,
      },
    },
  });

  script.runInContext(context);

  if (!capturedHandler) {
    throw new Error('Handler não capturado');
  }

  return { handler: capturedHandler, createClientCalls, fetchCalls, updates };
};

test('handler de uaz-get-qr rejeita requisição sem Authorization', async () => {
  const { handler, createClientCalls } = loadHandler();

  const response = await handler(new Request('https://example.com', { method: 'POST' }));

  assert.equal(createClientCalls.length, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Credenciais ausentes' });
});

test('handler de uaz-get-qr retorna erro quando credencial não possui configuração UAZ', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123' };
  const fetchCalls: Request[] = [];

  const supabaseClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
    },
    from(table: string) {
      if (table === 'credentials') {
        return {
          select() {
            return this;
          },
          eq() {
            return {
              single: async () => ({ data: credentialRecord, error: null }),
            };
          },
          update() {
            return {
              eq() {
                return {
                  eq: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      }

      throw new Error('Tabela inesperada');
    },
  };

  const { handler } = loadHandler({
    supabaseClient: supabaseClient as unknown as Record<string, unknown>,
    ensureCredentialOwnership: () => ({ credential: credentialRecord, response: undefined }),
    fetchImpl: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = input instanceof Request ? input : new Request(input, init);
      fetchCalls.push(request);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1' }),
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Credencial sem configuração UAZ' });
  assert.equal(fetchCalls.length, 0);
});

test('handler de uaz-get-qr retorna dados quando UAZ responde com sucesso', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123', subdomain: 'tenant', token: 'uaz-token' };
  const updates: Array<Record<string, unknown>> = [];

  const supabaseClient = {
    auth: {
      getUser: async (token: string) => {
        assert.equal(token, 'valid-token');
        return { data: { user: { id: 'user-123' } }, error: null };
      },
    },
    from(table: string) {
      if (table === 'credentials') {
        return {
          select() {
            return this;
          },
          eq(field: string, value: string) {
            assert.equal(field, 'id');
            assert.equal(value, 'cred-1');
            return {
              single: async () => ({ data: credentialRecord, error: null }),
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq(field: string, value: string) {
                if (field === 'id') {
                  assert.equal(value, 'cred-1');
                }
                return {
                  eq(secondField: string, secondValue: string) {
                    if (secondField === 'user_id') {
                      assert.equal(secondValue, 'user-123');
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Tabela inesperada: ${table}`);
    },
  };

  const fetchCalls: Request[] = [];

  const { handler } = loadHandler({
    supabaseClient: supabaseClient as unknown as Record<string, unknown>,
    ensureCredentialOwnership: () => ({ credential: credentialRecord, response: undefined }),
    fetchImpl: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = input instanceof Request ? input : new Request(input, init);
      fetchCalls.push(request);
      assert.equal(request.url, 'https://tenant.uazapi.com/instance/status');
      assert.equal(request.headers.get('token'), 'uaz-token');
      return new Response(JSON.stringify({
        status: { connected: true },
        instance: {
          status: 'connected',
          qrcode: 'data:image/png;base64,123',
          profileName: 'Perfil',
          owner: '+5511999999999',
          paircode: '123456',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1' }),
  }));

  assert.equal(fetchCalls.length, 1);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    status: 'connected',
    qrCode: 'data:image/png;base64,123',
    profileName: 'Perfil',
    phoneNumber: '+5511999999999',
    connected: true,
    pairingCode: '123456',
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'connected');
});

test('handler de uaz-get-qr trata resposta vazia da UAZ', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123', subdomain: 'tenant', token: 'uaz-token' };
  const updates: Array<Record<string, unknown>> = [];

  const supabaseClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
    },
    from(table: string) {
      if (table === 'credentials') {
        return {
          select() {
            return this;
          },
          eq(field: string, value: string) {
            assert.equal(field, 'id');
            assert.equal(value, 'cred-1');
            return {
              single: async () => ({ data: credentialRecord, error: null }),
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq(firstField: string, firstValue: string) {
                if (firstField === 'id') {
                  assert.equal(firstValue, 'cred-1');
                }
                return {
                  eq(secondField: string, secondValue: string) {
                    if (secondField === 'user_id') {
                      assert.equal(secondValue, 'user-123');
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Tabela inesperada: ${table}`);
    },
  };

  const { handler } = loadHandler({
    supabaseClient: supabaseClient as unknown as Record<string, unknown>,
    ensureCredentialOwnership: () => ({ credential: credentialRecord, response: undefined }),
    fetchImpl: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = input instanceof Request ? input : new Request(input, init);
      assert.equal(request.url, 'https://tenant.uazapi.com/instance/status');
      return new Response(null, { status: 204 });
    },
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1' }),
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, 'disconnected');
  assert.equal(payload.connected, false);
  assert.equal('qrCode' in payload, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'disconnected');
});

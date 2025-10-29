import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

type ContactHandlerSetup = {
  handler: (req: Request) => Promise<Response>;
  createClientCalls: unknown[][];
  updates: Array<Record<string, unknown>>;
};

const loadContactDetailsHandler = (options?: {
  supabaseClient?: unknown;
  ensureCredentialOwnership?: (credential: unknown, userId: string, headers: Record<string, string>) => { credential: unknown; response: Response | null };
  fetchImpl?: typeof fetch;
  env?: Record<string, string>;
}): ContactHandlerSetup => {
  const moduleUrl = new URL('../../supabase/functions/uaz-fetch-contact-details/index.ts', import.meta.url);
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
  const updates: Array<Record<string, unknown>> = [];
  const env = options?.env ?? {
    SUPABASE_URL: 'http://supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };

  const supabaseClient = (options?.supabaseClient as Record<string, unknown> | undefined) ?? {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    single: async () => ({ data: { wa_chat_id: 'chat-wa-id' }, error: null }),
                  };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return {
            eq() {
              return {
                eq: () => Promise.resolve({ data: null, error: null }),
              };
            },
          };
        },
      };
    },
  };

  const ensureCredentialOwnership = options?.ensureCredentialOwnership ?? (() => ({ credential: { subdomain: 'tenant', token: 'token', user_id: 'user-123' }, response: null }));
  const fetchImpl = options?.fetchImpl ?? (async () => new Response(JSON.stringify({ name: 'Cliente', image: 'https://img', phone: '5511' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

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
          return supabaseClient;
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

  (context as Record<string, unknown>).globalThis = context;

  script.runInContext(context);

  const handler = (module.exports.handler as ((req: Request) => Promise<Response>) | undefined) ?? capturedHandler;

  if (!handler) {
    throw new Error('Handler não capturado');
  }

  return { handler, createClientCalls, updates };
};

test('handler de uaz-fetch-contact-details rejeita requisição sem Authorization', async () => {
  const { handler, createClientCalls } = loadContactDetailsHandler();

  const response = await handler(new Request('https://example.com', { method: 'POST' }));

  assert.equal(createClientCalls.length, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Credenciais ausentes' });
});

test('handler de uaz-fetch-contact-details processa token válido e atualiza chat', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123', subdomain: 'tenant', token: 'uaz-token' };
  const chatRecord = { wa_chat_id: '5511999999999@c.us' };
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
        };
      }

      if (table === 'chats') {
        return {
          select() {
            return {
              eq(field: string, value: string) {
                assert.equal(field, 'id');
                assert.equal(value, 'chat-1');
                return {
                  eq(field2: string, value2: string) {
                    assert.equal(field2, 'user_id');
                    assert.equal(value2, 'user-123');
                    return {
                      single: async () => ({ data: chatRecord, error: null }),
                    };
                  },
                };
              },
            };
          },
          update(values: Record<string, unknown>) {
            updates.push(values);
            return {
              eq(field: string, value: string) {
                assert.equal(field, 'id');
                assert.equal(value, 'chat-1');
                return {
                  eq(field2: string, value2: string) {
                    assert.equal(field2, 'user_id');
                    assert.equal(value2, 'user-123');
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

  const ensureCredentialOwnership = () => ({ credential: credentialRecord, response: null });

  const fetchImpl = async () => new Response(
    JSON.stringify({ name: 'Cliente', image: 'https://img', phone: '5511999999999', wa_isGroup: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const { handler, createClientCalls } = loadContactDetailsHandler({
    supabaseClient,
    ensureCredentialOwnership,
    fetchImpl,
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1', chatId: 'chat-1' }),
  }));

  assert.equal(createClientCalls.length, 1);
  assert.equal(updates.length, 1);
  const [firstUpdate] = updates as Array<{ name?: string; avatar?: string }>;
  assert.equal(firstUpdate?.name, 'Cliente');
  assert.equal(firstUpdate?.avatar, 'https://img');

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    name: 'Cliente',
    avatar: 'https://img',
    phone: '5511999999999',
    isGroup: true,
  });
});

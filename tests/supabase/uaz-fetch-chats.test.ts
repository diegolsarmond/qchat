import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { persistChats } from '../../supabase/functions/uaz-fetch-chats/upsert-chats.ts';

type ChatsHandlerSetup = {
  handler: (req: Request) => Promise<Response>;
  createClientCalls: unknown[][];
  persistCalls: Array<Record<string, unknown>>;
};

const loadChatsHandler = (options?: {
  supabaseClient?: unknown;
  ensureCredentialOwnership?: (credential: unknown, userId: string, headers: Record<string, string>) => { credential: unknown; response: Response | null };
  fetchImpl?: typeof fetch;
  env?: Record<string, string>;
}): ChatsHandlerSetup => {
  const moduleUrl = new URL('../../supabase/functions/uaz-fetch-chats/index.ts', import.meta.url);
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
  const persistCalls: Array<Record<string, unknown>> = [];
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
          return this;
        },
        eq() {
          return {
            single: async () => ({ data: null, error: null }),
          };
        },
        order() {
          return this;
        },
        range: async () => ({ data: [], error: null, count: 0 }),
      };
    },
  };

  const ensureCredentialOwnership = options?.ensureCredentialOwnership ?? (() => ({ credential: { subdomain: 'tenant', token: 'token' }, response: null }));
  const fetchImpl = options?.fetchImpl ?? (async () => new Response(JSON.stringify({ chats: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

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

    if (specifier === './upsert-chats.ts') {
      return {
        persistChats: async (payload: Record<string, unknown>) => {
          persistCalls.push(payload);
          return null;
        },
      };
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

  return { handler, createClientCalls, persistCalls };
};

test('persistChats utiliza uma única chamada ao upsert com matriz de chats', async () => {
  let upsertCalls = 0;
  let receivedRecords: unknown[] | undefined;
  let receivedOptions: { onConflict: string } | undefined;

  const supabaseClient = {
    from(table: string) {
      assert.strictEqual(table, 'chats');
      return {
        async upsert(records: unknown[], options: { onConflict: string }) {
          upsertCalls += 1;
          receivedRecords = records;
          receivedOptions = options;
          return { data: null, error: null };
        },
      };
    },
  };

  const chats = [
    {
      wa_chatid: 'chat-1',
      name: 'Primeiro Chat',
      wa_lastMessageTextVote: 'Olá',
      wa_lastMsgTimestamp: 123,
      wa_unreadCount: 2,
      image: 'https://example.com/img1.png',
      wa_isGroup: true,
    },
    {
      wa_chatid: 'chat-2',
      wa_name: 'Segundo Chat',
      wa_lastMessageTextVote: '',
      wa_lastMsgTimestamp: 456,
      wa_unreadCount: 0,
    },
  ];

  await persistChats({
    supabaseClient: supabaseClient as never,
    credentialId: 'cred-123',
    userId: 'user-456',
    chats,
  });

  assert.strictEqual(upsertCalls, 1);
  assert.ok(Array.isArray(receivedRecords));
  assert.deepStrictEqual(receivedOptions, { onConflict: 'credential_id,wa_chat_id' });

  assert.deepStrictEqual(receivedRecords, [
    {
      credential_id: 'cred-123',
      user_id: 'user-456',
      wa_chat_id: 'chat-1',
      name: 'Primeiro Chat',
      last_message: 'Olá',
      last_message_timestamp: 123,
      unread_count: 2,
      avatar: 'https://example.com/img1.png',
      is_group: true,
    },
    {
      credential_id: 'cred-123',
      user_id: 'user-456',
      wa_chat_id: 'chat-2',
      name: 'Segundo Chat',
      last_message: '',
      last_message_timestamp: 456,
      unread_count: 0,
      avatar: '',
      is_group: false,
    },
  ]);
});

test('handler de uaz-fetch-chats rejeita requisição sem Authorization', async () => {
  const { handler, createClientCalls } = loadChatsHandler();

  const response = await handler(new Request('https://example.com', { method: 'POST' }));

  assert.equal(createClientCalls.length, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Credenciais ausentes' });
});

test('handler de uaz-fetch-chats processa token válido com uma única criação de cliente', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123', subdomain: 'tenant', token: 'uaz-token' };
  const dbChats = [
    { id: 'chat-db', credential_id: 'cred-1', user_id: 'user-123', last_message_timestamp: 123, attendance_status: 'in_service' },
  ];

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
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          order() {
            return query;
          },
          range: async () => ({ data: dbChats, error: null, count: dbChats.length }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
        };

        return query;
      }

      throw new Error(`Tabela inesperada: ${table}`);
    },
  };

  const ensureCredentialOwnership = () => ({ credential: credentialRecord, response: null });

  const fetchImpl = async () => new Response(
    JSON.stringify({ chats: [{ wa_chatid: 'chat-1' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const { handler, createClientCalls, persistCalls } = loadChatsHandler({
    supabaseClient,
    ensureCredentialOwnership,
    fetchImpl,
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1', limit: 1, offset: 0 }),
  }));

  assert.equal(createClientCalls.length, 1);
  assert.deepEqual(createClientCalls[0][0], 'http://supabase.local');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    chats: dbChats.map(chat => ({ ...chat, attendance_status: chat.attendance_status ?? 'waiting' })),
    total: dbChats.length,
    hasMore: false,
  });
  assert.equal(persistCalls.length, 1);
  const [firstPersist] = persistCalls;
  assert.equal((firstPersist as { credentialId: string }).credentialId, 'cred-1');
});

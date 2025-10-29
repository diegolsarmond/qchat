import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { upsertFetchedMessages } from '../../supabase/functions/uaz-fetch-messages/upsert-messages.ts';
import { resolveMessageStorage } from '../../supabase/functions/message-storage.ts';

type MessagesHandlerSetup = {
  handler: (req: Request) => Promise<Response>;
  createClientCalls: unknown[][];
  upsertCalls: Array<Record<string, unknown>>;
};

const loadMessagesHandler = (options?: {
  supabaseClient?: unknown;
  ensureCredentialOwnership?: (credential: unknown, userId: string, headers: Record<string, string>) => { credential: unknown; response: Response | null };
  fetchImpl?: typeof fetch;
  env?: Record<string, string>;
}): MessagesHandlerSetup => {
  const moduleUrl = new URL('../../supabase/functions/uaz-fetch-messages/index.ts', import.meta.url);
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
  const upsertCalls: Array<Record<string, unknown>> = [];
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
          return this;
        },
        single: async () => ({ data: null, error: null }),
        order() {
          return this;
        },
        range: async () => ({ data: [], error: null, count: 0 }),
      };
    },
  };

  const ensureCredentialOwnership = options?.ensureCredentialOwnership ?? (() => ({ credential: { subdomain: 'tenant', token: 'token' }, response: null }));
  const fetchImpl = options?.fetchImpl ?? (async () => new Response(JSON.stringify({ messages: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

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

    if (specifier === './upsert-messages.ts') {
      return {
        upsertFetchedMessages: async (payload: Record<string, unknown>) => {
          upsertCalls.push(payload);
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

  return { handler, createClientCalls, upsertCalls };
};

test('upsertFetchedMessages aplica resolveMessageStorage e upserta mensagens individualmente', async () => {
  const messages = [
    {
      messageid: 'msg-1',
      text: 'Olá',
      messageType: 'text',
      fromMe: true,
      sender: '5511999999999',
      senderName: 'Atendente',
      status: 'sent',
      messageTimestamp: 1730000000,
      isPrivate: false,
    },
    {
      messageid: 'msg-2',
      messageType: 'media',
      mediaType: 'image',
      caption: 'Comprovante',
      mediaUrl: 'https://example.com/file.png',
      sender: '5511888888888',
      senderName: 'Cliente',
      status: 'delivered',
      messageTimestamp: 1730000001,
      isPrivate: true,
    },
  ];

  const upsertCalls: Array<{
    records: Array<Record<string, unknown>>;
    options: { onConflict: string };
  }> = [];

  const supabaseClient = {
    from(table: string) {
      assert.equal(table, 'messages');
      return {
        upsert(records: Array<Record<string, unknown>>, options: { onConflict: string }) {
          upsertCalls.push({ records, options });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  await upsertFetchedMessages({
    supabaseClient,
    messages,
    chatId: 'chat-1',
    credentialId: 'cred-1',
  });

  assert.equal(upsertCalls.length, messages.length);

  upsertCalls.forEach(({ records, options }, index) => {
    assert.equal(records.length, 1);
    assert.deepEqual(options, { onConflict: 'chat_id,wa_message_id' });

    const [record] = records;
    const original = messages[index];
    const storage = resolveMessageStorage({
      content: original.text || '',
      messageType: original.messageType || 'text',
      mediaType: original.mediaType || null,
      caption: original.caption || null,
      documentName: original.documentName || null,
      mediaUrl: original.mediaUrl || original.url || null,
      mediaBase64: original.mediaBase64 || original.base64 || null,
    });

    assert.deepEqual(record, {
      chat_id: 'chat-1',
      credential_id: 'cred-1',
      wa_message_id: original.messageid,
      content: storage.content,
      message_type: storage.messageType,
      media_type: storage.mediaType,
      caption: storage.caption,
      document_name: storage.documentName,
      media_url: storage.mediaUrl,
      media_base64: storage.mediaBase64,
      from_me: original.fromMe || false,
      sender: original.sender || '',
      sender_name: original.senderName || '',
      status: original.status || '',
      message_timestamp: original.messageTimestamp || 0,
      is_private: Boolean(original.isPrivate),
    });
  });
});

test('upsertFetchedMessages ignora mensagens inválidas mantendo demais upserts', async () => {
  const messages = [
    {
      messageType: 'text',
      text: 'mensagem sem id',
    },
    {
      messageid: 'msg-1',
      text: 'válida',
    },
  ];

  const upsertCalls: Array<{
    records: Array<Record<string, unknown>>;
    options: { onConflict: string };
  }> = [];

  const supabaseClient = {
    from(table: string) {
      assert.equal(table, 'messages');
      return {
        upsert(records: Array<Record<string, unknown>>, options: { onConflict: string }) {
          upsertCalls.push({ records, options });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };

  await upsertFetchedMessages({
    supabaseClient,
    messages,
    chatId: 'chat-1',
    credentialId: 'cred-1',
  });

  assert.equal(upsertCalls.length, 1);
  const [{ records, options }] = upsertCalls;
  assert.equal(records.length, 1);
  assert.deepEqual(options, { onConflict: 'chat_id,wa_message_id' });
  assert.equal(records[0].wa_message_id, 'msg-1');
});

test('handler de uaz-fetch-messages rejeita requisição sem Authorization', async () => {
  const { handler, createClientCalls } = loadMessagesHandler();

  const response = await handler(new Request('https://example.com', { method: 'POST' }));

  assert.equal(createClientCalls.length, 0);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Credenciais ausentes' });
});

test('handler de uaz-fetch-messages processa token válido e upserta mensagens', async () => {
  const credentialRecord = { id: 'cred-1', user_id: 'user-123', subdomain: 'tenant', token: 'uaz-token' };
  const chatRecord = { id: 'chat-1', wa_chat_id: 'chat-wa-id', credential_id: 'cred-1', user_id: 'user-123' };
  const dbMessages = [
    { id: 'db-msg-1', chat_id: 'chat-1', user_id: 'user-123', message_timestamp: 100 },
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
        return {
          select() {
            return this;
          },
          eq(field: string, value: string) {
            if (field === 'id') {
              assert.equal(value, 'chat-1');
            } else if (field === 'credential_id') {
              assert.equal(value, 'cred-1');
            } else if (field === 'user_id') {
              assert.equal(value, 'user-123');
            } else {
              throw new Error(`Filtro inesperado em chats: ${field}`);
            }

            return this;
          },
          single: async () => ({ data: chatRecord, error: null }),
        };
      }

      if (table === 'messages') {
        const query = {
          select() {
            return query;
          },
          eq(field: string, value: string) {
            if (field === 'chat_id') {
              assert.equal(value, 'chat-1');
            } else if (field === 'credential_id') {
              assert.equal(value, 'cred-1');
            } else {
              throw new Error(`Filtro inesperado em messages: ${field}`);
            }

            return query;
          },
          order() {
            return query;
          },
          range: async (start: number, end: number) => {
            assert.equal(start, 0);
            assert.equal(end, 0);
            return { data: dbMessages, error: null, count: dbMessages.length };
          },
        };

        return query;
      }

      throw new Error(`Tabela inesperada: ${table}`);
    },
  };

  const ensureCredentialOwnership = () => ({ credential: credentialRecord, response: null });

  const fetchImpl = async () => new Response(
    JSON.stringify({ messages: [{ messageid: 'msg-api-1' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

  const { handler, createClientCalls, upsertCalls } = loadMessagesHandler({
    supabaseClient,
    ensureCredentialOwnership,
    fetchImpl,
  });

  const response = await handler(new Request('https://example.com', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
    body: JSON.stringify({ credentialId: 'cred-1', chatId: 'chat-1', limit: 1, offset: 0, order: 'asc' }),
  }));

  assert.equal(createClientCalls.length, 1);
  assert.equal(upsertCalls.length, 1);
  const [firstUpsert] = upsertCalls;
  assert.deepEqual((firstUpsert as { messages: unknown[] }).messages, [{ messageid: 'msg-api-1' }]);

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    messages: dbMessages,
    total: dbMessages.length,
    hasMore: false,
    nextOffset: 1,
  });
});

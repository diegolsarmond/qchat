import test from 'node:test';
import assert from 'node:assert/strict';
import { persistChats } from '../../supabase/functions/uaz-fetch-chats/upsert-chats.ts';

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

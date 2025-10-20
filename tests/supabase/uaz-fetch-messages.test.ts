import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertFetchedMessages } from '../../supabase/functions/uaz-fetch-messages/upsert-messages.ts';
import { resolveMessageStorage } from '../../supabase/functions/message-storage.ts';

test('upsertFetchedMessages agrega mensagens em única chamada e aplica resolveMessageStorage', async () => {
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
    userId: 'user-1',
  });

  assert.equal(upsertCalls.length, 1);

  const [{ records, options }] = upsertCalls;
  assert.equal(records.length, messages.length);
  assert.deepEqual(options, { onConflict: 'chat_id,wa_message_id' });

  records.forEach((record, index) => {
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
      user_id: 'user-1',
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

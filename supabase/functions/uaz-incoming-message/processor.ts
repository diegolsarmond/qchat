import { upsertFetchedMessages } from "../uaz-fetch-messages/upsert-messages.ts";
import { resolveMessageStorage } from "../message-storage.ts";
import type { normalizeMessage } from "./normalize.ts";

type SupabaseClient = any;

type NormalizedMessage = NonNullable<ReturnType<typeof normalizeMessage>> & { waChatId: string };

type ProcessIncomingMessagesParams = {
  supabaseClient: SupabaseClient;
  credentialId: string;
  userId?: string | null;
  credentialUserId?: string | null;
  messages: NormalizedMessage[];
};

export const processIncomingMessages = async ({
  supabaseClient,
  credentialId,
  userId,
  credentialUserId,
  messages,
}: ProcessIncomingMessagesParams) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  const grouped = new Map<string, NormalizedMessage[]>();

  for (const message of messages) {
    const list = grouped.get(message.waChatId) ?? [];
    list.push(message);
    grouped.set(message.waChatId, list);
  }

  const scopeUserId = typeof userId === "string" && userId.length > 0
    ? userId
    : (typeof credentialUserId === "string" && credentialUserId.length > 0 ? credentialUserId : null);

  let processed = 0;

  for (const [waChatId, chatMessages] of grouped.entries()) {
    let chatQuery = supabaseClient
      .from("chats")
      .select("id")
      .eq("credential_id", credentialId)
      .eq("wa_chat_id", waChatId)
      .limit(1);

    if (scopeUserId) {
      chatQuery = chatQuery.eq("user_id", scopeUserId);
    }

    const { data: chat, error: chatError } = await chatQuery.maybeSingle();

    if (chatError || !chat) {
      continue;
    }

    await upsertFetchedMessages({
      supabaseClient,
      messages: chatMessages.map(({ waChatId: _waChatId, media: _media, ...rest }) => rest),
      chatId: chat.id,
      credentialId,
      credentialUserId: credentialUserId ?? userId ?? undefined,
    });

    const lastMessage = chatMessages.reduce((current, candidate) => {
      if (!current) {
        return candidate;
      }
      return candidate.messageTimestamp > current.messageTimestamp ? candidate : current;
    }, undefined as NormalizedMessage | undefined);

    if (lastMessage) {
      const storage = resolveMessageStorage({
        content: lastMessage.text,
        messageType: lastMessage.messageType,
        mediaType: lastMessage.mediaType || null,
        caption: lastMessage.caption || null,
        documentName: lastMessage.documentName || null,
        mediaUrl: lastMessage.mediaUrl || null,
        mediaBase64: lastMessage.mediaBase64 || null,
      });

      let updateQuery = supabaseClient
        .from("chats")
        .update({
          last_message: storage.content,
          last_message_timestamp: lastMessage.messageTimestamp,
        })
        .eq("id", chat.id);

      if (scopeUserId) {
        updateQuery = updateQuery.eq("user_id", scopeUserId);
      }

      await updateQuery;
    }

    processed += chatMessages.length;
  }

  return processed;
};

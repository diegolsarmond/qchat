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

const upsertMessages = async ({
  supabaseClient,
  messages,
  chatId,
  credentialId,
  credentialUserId,
}: {
  supabaseClient: SupabaseClient;
  messages: Array<Record<string, any>>;
  chatId: string;
  credentialId: string;
  credentialUserId?: string | null;
}) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

  const userId = typeof credentialUserId === "string" && credentialUserId.length > 0
    ? credentialUserId
    : null;

  const payload = messages.map((msg) => {
    const storage = resolveMessageStorage({
      content: msg.text || "",
      messageType: msg.messageType || "text",
      mediaType: msg.mediaType || null,
      caption: msg.caption || null,
      documentName: msg.documentName || null,
      mediaUrl: msg.mediaUrl || msg.url || null,
      mediaBase64: msg.mediaBase64 || msg.base64 || null,
    });

    const record: Record<string, any> = {
      chat_id: chatId,
      credential_id: credentialId,
      wa_message_id: msg.messageid,
      content: storage.content,
      message_type: storage.messageType,
      media_type: storage.mediaType,
      caption: storage.caption,
      document_name: storage.documentName,
      media_url: storage.mediaUrl,
      media_base64: storage.mediaBase64,
      from_me: msg.fromMe || false,
      sender: msg.sender || "",
      sender_name: msg.senderName || "",
      status: msg.status || "",
      message_timestamp: msg.messageTimestamp || 0,
      is_private: Boolean(msg.isPrivate),
    };

    if (userId) {
      record.user_id = userId;
    }

    return record;
  });

  if (payload.length === 0) {
    return;
  }

  const validRecords = payload.filter((record) => {
    if (!record.wa_message_id) {
      console.warn(
        "[UAZ Incoming Message] Skipping message without wa_message_id",
        record
      );
      return false;
    }
    return true;
  });

  if (validRecords.length === 0) {
    return;
  }

  for (const record of validRecords) {
    try {
      const { error } = await supabaseClient
        .from("messages")
        .upsert([record], { onConflict: "chat_id,wa_message_id" });

      if (error) {
        console.error(
          "[UAZ Incoming Message] Failed to upsert message:",
          error,
          record
        );
      }
    } catch (upsertError) {
      console.error(
        "[UAZ Incoming Message] Failed to upsert message:",
        upsertError,
        record
      );
    }
  }
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

    await upsertMessages({
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

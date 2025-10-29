import { resolveMessageStorage } from "../message-storage.ts";

type SupabaseClient = any;

type UpsertFetchedMessagesParams = {
  supabaseClient: SupabaseClient;
  messages: Array<Record<string, any>>;
  chatId: string;
  credentialId: string;
  credentialUserId?: string | null;
};

export async function upsertFetchedMessages({
  supabaseClient,
  messages,
  chatId,
  credentialId,
  credentialUserId,
}: UpsertFetchedMessagesParams) {
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
        "[UAZ Fetch Messages] Skipping message without wa_message_id",
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
          "[UAZ Fetch Messages] Failed to upsert message:",
          error,
          record
        );
      }
    } catch (upsertError) {
      console.error(
        "[UAZ Fetch Messages] Failed to upsert message:",
        upsertError,
        record
      );
    }
  }
}

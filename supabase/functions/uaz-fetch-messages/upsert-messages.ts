import { resolveMessageStorage } from "../message-storage.ts";

type SupabaseClient = {
  from: (table: string) => {
    upsert: (
      records: Array<Record<string, unknown>>,
      options: { onConflict: string }
    ) => Promise<{ data?: unknown; error?: unknown }>;
  };
};

type UpsertFetchedMessagesParams = {
  supabaseClient: SupabaseClient;
  messages: Array<Record<string, any>>;
  chatId: string;
  credentialId: string;
  userId: string;
};

export async function upsertFetchedMessages({
  supabaseClient,
  messages,
  chatId,
  credentialId,
  userId,
}: UpsertFetchedMessagesParams) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return;
  }

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

    return {
      chat_id: chatId,
      credential_id: credentialId,
      user_id: userId,
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
  });

  if (payload.length === 0) {
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("messages")
      .upsert(payload, { onConflict: "chat_id,wa_message_id" });

    if (error) {
      console.error("[UAZ Fetch Messages] Failed to upsert messages:", error);
    }
  } catch (upsertError) {
    console.error("[UAZ Fetch Messages] Failed to upsert messages:", upsertError);
  }
}

const toString = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
};

const toNumber = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
};

const extractMessages = (payload: Record<string, unknown>) => {
  const candidates = [
    payload.messages,
    payload.message,
    (payload.data as Record<string, unknown> | undefined)?.messages,
    (payload.payload as Record<string, unknown> | undefined)?.messages,
    (payload.event as Record<string, unknown> | undefined)?.messages,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
    if (candidate && typeof candidate === "object") {
      return [candidate as Record<string, unknown>];
    }
  }
  return [];
};

const extractChatIdentifier = (
  message: Record<string, unknown>,
  fallback: Record<string, unknown>,
) => {
  const fromMessage =
    message.chatId ??
    message.chatid ??
    message.chat_id ??
    (message.chat as Record<string, unknown> | undefined)?.id ??
    (message.chat as Record<string, unknown> | undefined)?.chatId ??
    (message.chat as Record<string, unknown> | undefined)?.chatid ??
    null;
  if (fromMessage) {
    return toString(fromMessage);
  }
  const fromFallback =
    fallback.chatId ??
    fallback.chatid ??
    fallback.chat_id ??
    (fallback.chat as Record<string, unknown> | undefined)?.id ??
    (fallback.chat as Record<string, unknown> | undefined)?.chatId ??
    (fallback.chat as Record<string, unknown> | undefined)?.chatid ??
    null;
  return toString(fromFallback);
};

const normalizeMessage = (
  message: Record<string, unknown>,
  fallback: Record<string, unknown>,
) => {
  const waChatId = extractChatIdentifier(message, fallback);
  if (!waChatId) {
    return null;
  }
  const media = (message.media as Record<string, unknown> | undefined) ?? {};
  const timestamp = toNumber(
    message.messageTimestamp ??
      message.timestamp ??
      message.time ??
      message.date ??
      media.timestamp,
    Date.now(),
  );
  return {
    waChatId,
    messageid:
      message.messageid ??
      message.messageId ??
      message.message_id ??
      message.id ??
      media.messageid ??
      media.id ??
      `msg_${timestamp}`,
    text:
      toString(message.text ?? message.body ?? message.message ?? media.text ?? media.caption),
    messageType: toString(message.messageType ?? message.type ?? media.type || "text").toLowerCase() || "text",
    mediaType: toString(message.mediaType ?? media.mediaType ?? media.mimetype ?? media.mimeType ?? media.type || ""),
    caption: toString(message.caption ?? media.caption),
    documentName: toString(message.documentName ?? media.documentName ?? media.fileName ?? media.filename),
    mediaUrl: toString(message.mediaUrl ?? message.url ?? media.mediaUrl ?? media.url ?? media.link),
    mediaBase64: toString(message.mediaBase64 ?? message.base64 ?? media.mediaBase64 ?? media.base64),
    fromMe: toBoolean(message.fromMe ?? message.from_me ?? message.sentByMe ?? message.isMe ?? message.from === "me"),
    sender: toString(message.sender ?? message.from ?? media.sender ?? media.from ?? ""),
    senderName: toString(message.senderName ?? message.sender_name ?? message.fromName ?? media.senderName ?? media.fromName ?? ""),
    status: toString(message.status ?? message.messageStatus ?? message.state ?? message.deliveryStatus ?? ""),
    messageTimestamp: timestamp,
    isPrivate: toBoolean(message.isPrivate ?? message.private ?? message.is_private ?? false),
    media,
  };
};

export { extractMessages, normalizeMessage };

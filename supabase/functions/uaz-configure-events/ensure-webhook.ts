// Utility functions inlined to avoid cross-function imports
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
  const messageTypeSource =
    message.messageType ?? message.type ?? media.type ?? "text";
  const mediaTypeSource =
    message.mediaType ??
    media.mediaType ??
    media.mimetype ??
    media.mimeType ??
    media.type ??
    "";
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
    messageType: toString(messageTypeSource || "text").toLowerCase() || "text",
    mediaType: toString(mediaTypeSource),
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

// Process incoming messages (inlined from processor.ts)
const processIncomingMessages = async (params: {
  supabaseClient: any;
  credentialId: string;
  userId: string | null;
  credentialUserId: string | null;
  messages: Array<ReturnType<typeof normalizeMessage> & { waChatId: string }>;
}) => {
  const { supabaseClient, credentialId, messages } = params;
  
  const chatGroups = new Map<string, Array<ReturnType<typeof normalizeMessage> & { waChatId: string }>>();
  for (const message of messages) {
    const existing = chatGroups.get(message.waChatId) ?? [];
    existing.push(message);
    chatGroups.set(message.waChatId, existing);
  }

  let totalProcessed = 0;

  for (const [waChatId, chatMessages] of chatGroups) {
    try {
      const { data: chat } = await supabaseClient
        .from('chats')
        .select('*')
        .eq('credential_id', credentialId)
        .eq('wa_chat_id', waChatId)
        .maybeSingle();

      if (chat) {
        for (const msg of chatMessages) {
          try {
            await supabaseClient.from('messages').upsert({
              chat_id: chat.id,
              credential_id: credentialId,
              wa_message_id: msg.messageid,
              content: msg.text,
              message_type: msg.messageType,
              media_type: msg.mediaType,
              caption: msg.caption,
              document_name: msg.documentName,
              media_url: msg.mediaUrl,
              media_base64: msg.mediaBase64,
              from_me: msg.fromMe,
              sender: msg.sender,
              sender_name: msg.senderName,
              status: msg.status,
              message_timestamp: new Date(msg.messageTimestamp).toISOString(),
              is_private: msg.isPrivate,
            }, { onConflict: 'wa_message_id' });
            totalProcessed++;
          } catch (error) {
            console.error('[Process Messages] Failed to upsert message:', error);
          }
        }
      }
    } catch (error) {
      console.error('[Process Messages] Failed to process chat:', error);
    }
  }

  return totalProcessed;
};

type SupabaseClient = any;

type CredentialRecord = {
  id: string;
  subdomain: string;
  token?: string | null;
  admin_token?: string | null;
  user_id?: string | null;
  incoming_webhook_url?: string | null;
  incoming_sse_fallback_url?: string | null;
};

type EnsureParams = {
  credential: CredentialRecord;
  supabaseClient: SupabaseClient;
  webhookUrl?: string | null;
  fetchImpl?: typeof fetch;
};

type EnsureResult = {
  success: boolean;
  webhookConfigured: boolean;
  sseFallbackUsed: boolean;
  processedMessages: number;
  webhookUrl: string | null;
  fallbackUrl: string | null;
  error?: string;
};

const sanitizeBaseUrl = (value: string) => value.replace(/\/$/, "");

const appendCredentialQuery = (baseUrl: string, credentialId: string) => {
  if (baseUrl.includes("credentialId=")) {
    return baseUrl;
  }
  const hasQuery = baseUrl.includes("?");
  const separator = hasQuery ? "&" : "?";
  return `${baseUrl}${separator}credentialId=${credentialId}`;
};

const resolveIncomingWebhookUrl = (credentialId: string, provided?: string | null) => {
  if (typeof provided === "string" && provided.trim().length > 0) {
    return appendCredentialQuery(sanitizeBaseUrl(provided.trim()), credentialId);
  }

  const envUrl = Deno.env.get("UAZ_INCOMING_MESSAGE_URL") ?? null;

  if (envUrl && envUrl.trim().length > 0) {
    const trimmed = sanitizeBaseUrl(envUrl.trim());
    if (trimmed.includes("{credentialId}")) {
      return trimmed.replace(/\{credentialId\}/g, credentialId);
    }
    return appendCredentialQuery(trimmed, credentialId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  try {
    const parsed = new URL(supabaseUrl);
    const host = parsed.host.includes(".supabase.co")
      ? parsed.host.replace(".supabase.co", ".functions.supabase.co")
      : `${parsed.host}`;
    const base = `${parsed.protocol}//${host}/uaz-incoming-message`;
    return appendCredentialQuery(base, credentialId);
  } catch (_error) {
    return "";
  }
};

const collectEventEntries = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return [] as Array<Record<string, unknown>>;
  }

  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.events, record.data, record.result, record.items, record.event];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Array<Record<string, unknown>>;
    }
    if (candidate && typeof candidate === "object") {
      return [candidate as Record<string, unknown>];
    }
  }

  return [] as Array<Record<string, unknown>>;
};

const resolveEventName = (value: Record<string, unknown>) => {
  const candidates = [value.event, value.name, value.type, value.key];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim().toLowerCase();
    }
  }
  return "";
};

const resolveEventUrl = (value: Record<string, unknown>) => {
  const candidates = [value.url, value.endpoint, value.webhook, value.target];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
};

const isEventActive = (value: Record<string, unknown>) => {
  if (value.active === true || value.enabled === true || value.isActive === true) {
    return true;
  }
  const status = typeof value.status === "string" ? value.status.toLowerCase() : "";
  return status === "active" || status === "enabled" || status === "true";
};

const eventListPaths = [
  "/integration/event/messages/history",
  "/integration/events/messages/history",
  "/event/messages/history",
  "/events/messages/history",
  "/integration/event",
  "/integration/events",
  "/event",
  "/events",
];

const prepareHeaders = (credential: CredentialRecord) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (typeof credential.admin_token === "string" && credential.admin_token.length > 0) {
    headers.admintoken = credential.admin_token;
  }

  if (typeof credential.token === "string" && credential.token.length > 0) {
    headers.token = credential.token;
  }

  return headers;
};

const fetchJson = async (fetchImpl: typeof fetch, url: string, init: RequestInit) => {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const readSseStream = async (response: Response, limit = 10, timeoutMs = 5000) => {
  if (!response.body) {
    return [] as Array<Record<string, unknown>>;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const messages: Array<Record<string, unknown>> = [];
  let eventsRead = 0;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const chunk = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"));
      if (dataLines.length > 0) {
        const payload = dataLines.map((line) => line.slice(5).trim()).join("\n");
        if (payload.length > 0) {
          try {
            const parsed = JSON.parse(payload);
            if (parsed && typeof parsed === "object") {
              messages.push(parsed as Record<string, unknown>);
              eventsRead += 1;
            }
          } catch (_error) {
          }
        }
      }
      if (eventsRead >= limit) {
        return messages;
      }
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return messages;
};

export const ensureMessagesHistoryIntegration = async ({
  credential,
  supabaseClient,
  webhookUrl,
  fetchImpl = fetch,
}: EnsureParams): Promise<EnsureResult> => {
  const targetUrl = resolveIncomingWebhookUrl(credential.id, webhookUrl ?? credential.incoming_webhook_url ?? null);

  if (!targetUrl) {
    return {
      success: false,
      webhookConfigured: false,
      sseFallbackUsed: false,
      processedMessages: 0,
      webhookUrl: null,
      fallbackUrl: null,
      error: "Webhook URL indisponível",
    };
  }

  const headers = prepareHeaders(credential);
  const baseUrl = `https://${credential.subdomain}.uazapi.com`;
  let webhookConfigured = false;
  let lastError: string | undefined;

  for (const path of eventListPaths) {
    try {
      const payload = await fetchJson(fetchImpl, `${baseUrl}${path}`, { method: "GET", headers });
      if (!payload) {
        continue;
      }
      const events = collectEventEntries(payload);
      if (events.length === 0) {
        continue;
      }
      const match = events.find((event) => resolveEventName(event) === "messages/history");
      if (match) {
        const existingUrl = resolveEventUrl(match);
        if (existingUrl && existingUrl === targetUrl && isEventActive(match)) {
          webhookConfigured = true;
        }
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
    }
  }

  if (!webhookConfigured) {
    const body = JSON.stringify({ event: "messages/history", url: targetUrl, active: true });
    for (const method of ["PUT", "POST"]) {
      let updated = false;
      for (const path of eventListPaths) {
        try {
          const response = await fetchImpl(`${baseUrl}${path}`, { method, headers, body });
          if (response.ok) {
            webhookConfigured = true;
            updated = true;
            break;
          }
          lastError = `${path} -> ${response.status}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
        }
      }
      if (updated) {
        break;
      }
    }
  }

  const updates: Record<string, unknown> = {};

  if (webhookConfigured) {
    updates.incoming_webhook_url = targetUrl;
    updates.incoming_webhook_verified_at = new Date().toISOString();
  }

  let sseFallbackUsed = false;
  let processedMessages = 0;
  let fallbackUrl: string | null = null;

  if (!webhookConfigured) {
    const template = Deno.env.get("UAZ_SSE_FALLBACK_URL") ?? null;
    if (template && template.trim().length > 0) {
      fallbackUrl = template.replace(/\{\{\s*subdomain\s*\}\}/gi, credential.subdomain);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetchImpl(fallbackUrl, {
          method: "GET",
          headers: { ...headers, Accept: "text/event-stream" },
          signal: controller.signal,
        });

        if (response.ok) {
          const payloads = await readSseStream(response);
          if (payloads.length > 0) {
            const normalized = payloads
              .flatMap((entry) => extractMessages(entry).map((message) => normalizeMessage(message, entry)))
              .filter((message): message is ReturnType<typeof normalizeMessage> & { waChatId: string } => Boolean(message));

            if (normalized.length > 0) {
              processedMessages = await processIncomingMessages({
                supabaseClient,
                credentialId: credential.id,
                userId: credential.user_id ?? null,
                credentialUserId: credential.user_id ?? null,
                messages: normalized,
              });
            }
          }
          sseFallbackUsed = true;
        } else {
          lastError = `${fallbackUrl} -> ${response.status}`;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  if (fallbackUrl) {
    updates.incoming_sse_fallback_url = fallbackUrl;
  }

  if (Object.keys(updates).length > 0) {
    try {
      let updateQuery = supabaseClient
        .from("credentials")
        .update(updates)
        .eq("id", credential.id);

      if (credential.user_id) {
        updateQuery = updateQuery.eq("user_id", credential.user_id);
      }

      await updateQuery;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
    }
  }

  return {
    success: webhookConfigured || processedMessages > 0,
    webhookConfigured,
    sseFallbackUsed,
    processedMessages,
    webhookUrl: targetUrl,
    fallbackUrl,
    error: lastError,
  };
};

export { resolveIncomingWebhookUrl };

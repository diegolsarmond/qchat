import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { upsertFetchedMessages } from "../uaz-fetch-messages/upsert-messages.ts";
import { resolveMessageStorage } from "../message-storage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    let accessToken = typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? null;
    if (anonKey && accessToken === anonKey) {
      accessToken = null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const clientOptions = accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      : undefined;

    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      clientOptions,
    );

    let userId: string | null = null;

    if (accessToken) {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

      if (authError || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Credenciais inválidas" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      userId = authData.user.id;
    }

    const payload = await req.json();
    const credentialId = payload.credentialId ?? payload.credential_id;

    if (!credentialId || typeof credentialId !== "string") {
      return new Response(
        JSON.stringify({ error: "credentialId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: credential, error: credError } = await supabaseClient
      .from("credentials")
      .select("*")
      .eq("id", credentialId)
      .single();

    if (credError || !credential) {
      return new Response(
        JSON.stringify({ error: "Credencial não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }

    const ownedCredential = ownership.credential;

    const eventToken = payload.token ?? payload.eventToken ?? payload.authToken ?? payload.signature;

    if (eventToken && eventToken !== ownedCredential.token) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const incomingMessages = extractMessages(payload);

    if (!incomingMessages.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = incomingMessages
      .map((message) => normalizeMessage(message, payload))
      .filter((message): message is ReturnType<typeof normalizeMessage> & { waChatId: string } => Boolean(message));

    if (!normalized.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const grouped = new Map<string, typeof normalized>();

    for (const message of normalized) {
      const list = grouped.get(message.waChatId) ?? [];
      list.push(message);
      grouped.set(message.waChatId, list);
    }

    let processed = 0;

    for (const [waChatId, messages] of grouped.entries()) {
      let chatQuery = supabaseClient
        .from("chats")
        .select("id")
        .eq("credential_id", credentialId)
        .eq("wa_chat_id", waChatId)
        .limit(1);

      if (userId) {
        chatQuery = chatQuery.eq("user_id", userId);
      }

      const { data: chat, error: chatError } = await chatQuery.maybeSingle();

      if (chatError || !chat) {
        continue;
      }

      await upsertFetchedMessages({
        supabaseClient,
        messages: messages.map(({ waChatId: _waChatId, media: _media, ...rest }) => rest),
        chatId: chat.id,
        credentialId,
        userId,
      });

      const lastMessage = messages.reduce((current, candidate) => {
        if (!current) {
          return candidate;
        }
        return candidate.messageTimestamp > current.messageTimestamp ? candidate : current;
      }, undefined as (typeof messages)[number] | undefined);

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

        if (userId) {
          updateQuery = updateQuery.eq("user_id", userId);
        }

        await updateQuery;
      }

      processed += messages.length;
    }

    return new Response(
      JSON.stringify({ success: true, processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[UAZ Incoming Message] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};

serve(handler);

export { handler };

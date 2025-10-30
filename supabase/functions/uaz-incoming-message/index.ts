import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { extractMessages, normalizeMessage } from "./normalize.ts";
import { processIncomingMessages } from "./processor.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const credentialId = url.searchParams.get("credentialId") ?? undefined;
      const exampleToken = url.searchParams.get("token") ?? "<token-da-credencial>";
      return new Response(
        JSON.stringify({
          name: "uaz-incoming-message",
          description: "Endpoint público para receber eventos de mensagens da UAZ API.",
          credentialId,
          url: `${url.origin}${url.pathname}`,
          example: {
            method: "POST",
            url: `${url.origin}${url.pathname}?credentialId=<credential-id>&token=${exampleToken}`,
            body: {
              credentialId: "<credential-id>",
              token: exampleToken,
              messages: [{ messageid: "msg-1", chatId: "123", text: "Olá" }],
            },
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (_error) {
      return new Response(
        JSON.stringify({ error: "Requisição inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
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
    const requestUrl = new URL(req.url);
    const credentialId =
      (typeof payload.credentialId === "string" && payload.credentialId.length > 0)
        ? payload.credentialId
        : (typeof payload.credential_id === "string" && payload.credential_id.length > 0)
          ? payload.credential_id
          : requestUrl.searchParams.get("credentialId");

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

    let isMember = false;

    if (userId) {
      const { data: membership } = await supabaseClient
        .from('credential_members')
        .select('user_id')
        .eq('credential_id', credentialId)
        .eq('user_id', userId)
        .maybeSingle();

      isMember = Boolean(membership);
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders, { isMember });

    if (ownership.response) {
      return ownership.response;
    }

    const ownedCredential = ownership.credential;

    const credentialToken = typeof ownedCredential.token === "string" ? ownedCredential.token : "";
    const headerToken = req.headers.get("x-uaz-signature")
      ?? req.headers.get("x-webhook-token")
      ?? req.headers.get("x-signature")
      ?? undefined;
    const queryToken = requestUrl.searchParams.get("token")
      ?? requestUrl.searchParams.get("eventToken")
      ?? requestUrl.searchParams.get("authToken")
      ?? undefined;
    const eventToken = [
      payload.token,
      payload.eventToken,
      payload.authToken,
      payload.signature,
      headerToken,
      queryToken,
    ].find((value) => typeof value === "string" && value.length > 0) ?? "";

    if (credentialToken) {
      if (!eventToken || eventToken !== credentialToken) {
        return new Response(
          JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
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

    const credentialUserId = typeof ownedCredential.user_id === "string" ? ownedCredential.user_id : null;

    const processed = await processIncomingMessages({
      supabaseClient,
      credentialId,
      userId,
      credentialUserId,
      messages: normalized,
    });

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

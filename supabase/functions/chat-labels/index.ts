import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatLabelPayload = {
  credentialId?: unknown;
  chatId?: unknown;
  labelId?: unknown;
};

const getSupabaseClient = (accessToken: string | null) => {
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

  return createClient(supabaseUrl, serviceRoleKey, clientOptions);
};

serve(async (req) => {
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

    const supabaseClient = getSupabaseClient(accessToken);

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

    let payload: ChatLabelPayload = {};

    try {
      payload = (await req.json()) as ChatLabelPayload;
    } catch {
      payload = {};
    }

    const credentialId = payload && typeof payload.credentialId === "string"
      ? payload.credentialId
      : null;

    if (!credentialId) {
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
        .from("credential_members")
        .select("user_id")
        .eq("credential_id", credentialId)
        .eq("user_id", userId)
        .maybeSingle();

      isMember = Boolean(membership);
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders, { isMember });

    if (ownership.response) {
      return ownership.response;
    }

    const chatId = payload && typeof payload.chatId === "string" ? payload.chatId : null;
    const labelId = payload && typeof payload.labelId === "string" ? payload.labelId : null;

    if (!chatId || !labelId) {
      return new Response(
        JSON.stringify({ error: "chatId e labelId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: chat, error: chatError } = await supabaseClient
      .from("chats")
      .select("id, credential_id")
      .eq("id", chatId)
      .single();

    if (chatError || !chat || chat.credential_id !== credentialId) {
      return new Response(
        JSON.stringify({ error: "Conversa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: label, error: labelError } = await supabaseClient
      .from("labels")
      .select("id, credential_id, name, color")
      .eq("id", labelId)
      .single();

    if (labelError || !label || label.credential_id !== credentialId) {
      return new Response(
        JSON.stringify({ error: "Etiqueta não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "POST") {
      const { error } = await supabaseClient
        .from("chat_labels")
        .upsert({ chat_id: chatId, label_id: labelId }, { onConflict: "chat_id,label_id" });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, label }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "DELETE") {
      const { error } = await supabaseClient
        .from("chat_labels")
        .delete()
        .eq("chat_id", chatId)
        .eq("label_id", labelId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Método não suportado" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[Chat Labels] Error:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});


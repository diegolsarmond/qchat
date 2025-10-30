import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { ensureMessagesHistoryIntegration, resolveIncomingWebhookUrl } from "./ensure-webhook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Credenciais ausentes" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = authHeader.slice(7).trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Credenciais inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { credentialId, webhookUrl } = await req.json();

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

    const userId = authData.user.id;
    let isMember = false;
    let membershipRole: string | null = null;

    const { data: membership } = await supabaseClient
      .from('credential_members')
      .select('user_id, role')
      .eq('credential_id', credentialId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membership) {
      isMember = true;
      membershipRole = typeof membership.role === "string" ? membership.role : null;
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders, { isMember });

    if (ownership.response) {
      return ownership.response;
    }

    const ensureResult = await ensureMessagesHistoryIntegration({
      credential: ownership.credential,
      supabaseClient,
      webhookUrl: typeof webhookUrl === "string" ? webhookUrl : null,
    });

    const resolvedUrl = resolveIncomingWebhookUrl(credentialId, typeof webhookUrl === "string" ? webhookUrl : credential.incoming_webhook_url ?? null);

    return new Response(
      JSON.stringify({
        success: ensureResult.success,
        webhookConfigured: ensureResult.webhookConfigured,
        sseFallbackUsed: ensureResult.sseFallbackUsed,
        processedMessages: ensureResult.processedMessages,
        webhookUrl: resolvedUrl,
        fallbackUrl: ensureResult.fallbackUrl,
        role: membershipRole,
        error: ensureResult.error ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
};

serve(handler);

export { handler };

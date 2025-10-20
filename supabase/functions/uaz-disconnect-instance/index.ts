import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { credentialId } = await req.json();

    if (!credentialId) {
      return new Response(
        JSON.stringify({ error: "credentialId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: credential, error: credentialError } = await supabaseClient
      .from("credentials")
      .select("id, subdomain, token")
      .eq("id", credentialId)
      .single();

    if (credentialError || !credential) {
      return new Response(
        JSON.stringify({ error: "Credencial não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const disconnectResponse = await fetch(
      `https://${credential.subdomain}.uazapi.com/instance/disconnect`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "token": credential.token ?? "",
        },
      },
    );

    if (!disconnectResponse.ok) {
      const message = await disconnectResponse.text();
      console.error("[UAZ Disconnect] API error", message);
      return new Response(
        JSON.stringify({ error: "Falha ao desconectar instância" }),
        { status: disconnectResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabaseClient
      .from("credentials")
      .update({
        status: "disconnected",
        qr_code: null,
        profile_name: null,
        phone_number: null,
      })
      .eq("id", credentialId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Falha ao atualizar credencial" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[UAZ Disconnect] Unexpected error", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

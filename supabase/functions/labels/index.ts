import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LabelPayload = {
  credentialId?: unknown;
  id?: unknown;
  name?: unknown;
  color?: unknown;
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

    let payload: LabelPayload | null = null;

    if (req.method !== "GET") {
      try {
        payload = (await req.json()) as LabelPayload;
      } catch {
        payload = {};
      }
    }

    const url = new URL(req.url);
    const credentialId = (() => {
      if (req.method === "GET") {
        const queryValue = url.searchParams.get("credentialId");
        return queryValue && queryValue.trim().length > 0 ? queryValue : null;
      }
      const bodyValue = payload && typeof payload.credentialId === "string"
        ? payload.credentialId
        : null;
      return bodyValue && bodyValue.trim().length > 0 ? bodyValue : null;
    })();

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

    if (req.method === "GET") {
      const { data, error } = await supabaseClient
        .from("labels")
        .select("id, credential_id, name, color")
        .eq("credential_id", credentialId)
        .order("name", { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const labels = Array.isArray(data)
        ? data.map((label) => ({
            id: label.id,
            credential_id: label.credential_id,
            name: label.name,
            color: label.color,
          }))
        : [];

      return new Response(
        JSON.stringify({ labels }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "POST") {
      const name = payload && typeof payload.name === "string" ? payload.name.trim() : "";

      if (!name) {
        return new Response(
          JSON.stringify({ error: "Nome é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const color = payload && typeof payload.color === "string" ? payload.color : null;

      const { data, error } = await supabaseClient
        .from("labels")
        .insert({ credential_id: credentialId, name, color })
        .select("id, credential_id, name, color")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ label: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "PATCH") {
      const id = payload && typeof payload.id === "string" ? payload.id : null;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const updates: Record<string, unknown> = {};

      if (payload && typeof payload.name === "string") {
        updates.name = payload.name.trim();
      }

      if (payload && Object.prototype.hasOwnProperty.call(payload, "color")) {
        updates.color = typeof payload.color === "string" ? payload.color : null;
      }

      if (Object.keys(updates).length === 0) {
        return new Response(
          JSON.stringify({ error: "Nenhum campo para atualizar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data, error } = await supabaseClient
        .from("labels")
        .update(updates)
        .eq("id", id)
        .eq("credential_id", credentialId)
        .select("id, credential_id, name, color")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ label: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method === "DELETE") {
      const id = payload && typeof payload.id === "string" ? payload.id : null;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error } = await supabaseClient
        .from("labels")
        .delete()
        .eq("id", id)
        .eq("credential_id", credentialId);

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
    console.error("[Labels] Error:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});


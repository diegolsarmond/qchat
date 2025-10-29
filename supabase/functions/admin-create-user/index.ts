import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdminCreateUserPayload = {
  email?: unknown;
  password?: unknown;
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

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "Credenciais ausentes" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = (await req.json()) as AdminCreateUserPayload;
    const email = typeof payload.email === "string" ? payload.email : null;
    const password = typeof payload.password === "string" ? payload.password : null;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[Admin Create User] Missing Supabase environment configuration");
      return new Response(
        JSON.stringify({ error: "Configuração do Supabase ausente" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      console.error("[Admin Create User] Failed to authenticate request", authError?.message);
      return new Response(
        JSON.stringify({ error: "Credenciais inválidas" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const appMetadata =
      (authData.user as { app_metadata?: Record<string, unknown> | undefined })?.app_metadata ?? {};
    const appRole = appMetadata.role as string | undefined;
    const appRoles = Array.isArray((appMetadata as { roles?: unknown }).roles)
      ? ((appMetadata as { roles?: string[] }).roles ?? [])
      : [];
    const isAdmin =
      appRole === "admin" || appRoles.includes("admin") || appMetadata.is_admin === true;

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Acesso não autorizado" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data, error } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      console.error("[Admin Create User] Failed to create user", error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const createdUserId = data.user?.id ?? null;

    if (createdUserId) {
      const { data: adminMemberships, error: adminMembershipError } = await supabaseClient
        .from("credential_members")
        .select("credential_id")
        .eq("user_id", authData.user.id);

      if (adminMembershipError) {
        console.error("[Admin Create User] Failed to load admin memberships", adminMembershipError.message);
      } else if (adminMemberships && adminMemberships.length > 0) {
        const upsertPayload = adminMemberships.map((membership) => ({
          credential_id: membership.credential_id,
          user_id: createdUserId,
          role: "agent",
        }));

        const { error: upsertError } = await supabaseClient
          .from("credential_members")
          .upsert(upsertPayload, { onConflict: "credential_id,user_id" });

        if (upsertError) {
          console.error("[Admin Create User] Failed to add user to credential members", upsertError.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId: data.user?.id ?? null }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (unknownError) {
    const message =
      typeof unknownError === "object" &&
      unknownError !== null &&
      "message" in unknownError &&
      typeof (unknownError as { message?: unknown }).message === "string"
        ? (unknownError as { message: string }).message
        : "Erro inesperado";

    console.error("[Admin Create User] Unexpected error", message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

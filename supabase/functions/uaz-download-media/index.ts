import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition,x-content-type,x-file-name",
};

const createSupabaseClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

const parseFileName = (contentDisposition: string | null) => {
  if (!contentDisposition) {
    return null;
  }
  const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) {
    return null;
  }
  const value = match[1] ?? match[2] ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { credentialId, url } = await req.json();

    if (!credentialId || !url) {
      return new Response(
        JSON.stringify({ error: "credentialId e url são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createSupabaseClient();
    const { data: credential, error: credentialError } = await supabaseClient
      .from("credentials")
      .select("token")
      .eq("id", credentialId)
      .single();

    if (credentialError || !credential) {
      return new Response(
        JSON.stringify({ error: "Credencial não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(url, {
      headers: {
        token: credential.token,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return new Response(
        JSON.stringify({ error: "Falha ao baixar mídia", details: errorBody }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = response.headers.get("content-disposition");
    const fileName = parseFileName(contentDisposition);

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(buffer.byteLength));
    headers.set("x-content-type", contentType);
    if (contentDisposition) {
      headers.set("content-disposition", contentDisposition);
    }
    if (fileName) {
      headers.set("x-file-name", fileName);
    }

    return new Response(buffer, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

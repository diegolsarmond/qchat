import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { ensureMessagesHistoryIntegration } from "../uaz-configure-events/ensure-webhook.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    let accessToken = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? null;
    if (anonKey && accessToken === anonKey) {
      accessToken = null;
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Credenciais ausentes' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const clientOptions = {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    };

    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      clientOptions
    );

    let userId: string | null = null;

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: 'Credenciais inválidas' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    userId = authData.user.id;

    const bodyText = await req.text();
    let credentialId: string | undefined;

    if (bodyText) {
      try {
        const payload = JSON.parse(bodyText) as { credentialId?: string };
        credentialId = payload.credentialId;
      } catch {
        return new Response(
          JSON.stringify({ error: 'Parâmetros inválidos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!credentialId) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros inválidos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Get QR] Request for credential:', credentialId);

    // Fetch credential from database
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError) {
      console.error('[UAZ Get QR] Credential not found:', credError);
    }

    let isMember = false;

    if (credential && userId) {
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

    const ownedCredential = ownership.credential as typeof ownership.credential & {
      subdomain?: string;
      token?: string;
      status?: string | null;
      qr_code?: string | null;
      profile_name?: string | null;
      phone_number?: string | null;
      incoming_webhook_url?: string | null;
      incoming_sse_fallback_url?: string | null;
    };

    if (!ownedCredential.subdomain || !ownedCredential.token) {
      return new Response(
        JSON.stringify({ error: 'Credencial sem configuração UAZ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Get QR] Fetching instance info from:', ownedCredential.subdomain);

    const fallbackStatus = typeof ownedCredential.status === 'string' && ownedCredential.status.length > 0
      ? ownedCredential.status
      : 'disconnected';

    const fallbackResponse = () => new Response(
      JSON.stringify({
        status: fallbackStatus,
        qrCode: ownedCredential.qr_code ?? null,
        profileName: ownedCredential.profile_name ?? null,
        phoneNumber: ownedCredential.phone_number ?? null,
        connected: fallbackStatus.toLowerCase() === 'connected',
        pairingCode: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

    // Get instance status from UAZ API
    let instanceResponse: Response;

    try {
      instanceResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/instance/status`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'token': ownedCredential.token,
        },
      });
    } catch (requestError) {
      console.error('[UAZ Get QR] Failed to reach UAZ API:', requestError);
      return fallbackResponse();
    }

    if (!instanceResponse.ok) {
      console.error('[UAZ Get QR] UAZ API error:', await instanceResponse.text());
      return fallbackResponse();
    }

    type InstanceData = {
      status?: { connected?: boolean } | string | null;
      instance?: {
        status?: string | null;
        qrcode?: string | null;
        profileName?: string | null;
        owner?: string | null;
        paircode?: string | null;
      } | null;
    };

    const instanceText = await instanceResponse.text();
    let instanceData: InstanceData = {};

    if (instanceText) {
      try {
        instanceData = JSON.parse(instanceText) as InstanceData;
      } catch (parseError) {
        console.error('[UAZ Get QR] Failed to parse UAZ response:', parseError);
        console.error('[UAZ Get QR] Raw response:', instanceText);
        return new Response(
          JSON.stringify({ error: 'Invalid response from UAZ API' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    console.log('[UAZ Get QR] Instance status:', instanceData.status);
    console.log('[UAZ Get QR] Full response:', JSON.stringify(instanceData, null, 2));

    // Update credential in database
    const updateData: any = {
      status: instanceData.instance?.status || 'disconnected',
      updated_at: new Date().toISOString(),
    };

    if (instanceData.instance?.qrcode) {
      updateData.qr_code = instanceData.instance.qrcode;
    }

    if (instanceData.instance?.profileName) {
      updateData.profile_name = instanceData.instance.profileName;
    }

    if (instanceData.instance?.owner) {
      updateData.phone_number = instanceData.instance.owner;
    }

    let updateQuery = supabaseClient
      .from('credentials')
      .update(updateData)
      .eq('id', credentialId);

    if (userId) {
      updateQuery = updateQuery.eq('user_id', userId);
    }

    const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error('[UAZ Get QR] Failed to update credential:', updateError);
    }

    const connected = typeof instanceData.status === 'object' && instanceData.status?.connected === true;

    if (connected) {
      try {
        await ensureMessagesHistoryIntegration({
          credential: ownedCredential,
          supabaseClient,
        });
      } catch (integrationError) {
        console.error('[UAZ Get QR] Failed to ensure incoming integration:', integrationError);
      }
    }

    return new Response(
      JSON.stringify({
        status: instanceData.instance?.status || 'disconnected',
        qrCode: instanceData.instance?.qrcode,
        profileName: instanceData.instance?.profileName,
        phoneNumber: instanceData.instance?.owner,
        connected,
        pairingCode: instanceData.instance?.paircode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Get QR] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);

export { handler };

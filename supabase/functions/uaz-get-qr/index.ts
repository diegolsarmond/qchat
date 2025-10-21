import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";

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
    const accessToken = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Credenciais ausentes' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
        JSON.stringify({ error: 'Credenciais inválidas' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { credentialId } = await req.json();

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

    const ownership = ensureCredentialOwnership(credential, authData.user.id, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }

    const ownedCredential = ownership.credential as typeof ownership.credential & {
      subdomain?: string;
      token?: string;
    };

    if (!ownedCredential.subdomain || !ownedCredential.token) {
      return new Response(
        JSON.stringify({ error: 'Credencial sem configuração UAZ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Get QR] Fetching instance info from:', ownedCredential.subdomain);

    // Get instance status from UAZ API
    const instanceResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/instance/status`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'token': ownedCredential.token,
      },
    });

    if (!instanceResponse.ok) {
      console.error('[UAZ Get QR] UAZ API error:', await instanceResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to fetch instance info' }),
        { status: instanceResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    const { error: updateError } = await supabaseClient
      .from('credentials')
      .update(updateData)
      .eq('id', credentialId)
      .eq('user_id', authData.user.id);

    if (updateError) {
      console.error('[UAZ Get QR] Failed to update credential:', updateError);
    }

    return new Response(
      JSON.stringify({
        status: instanceData.instance?.status || 'disconnected',
        qrCode: instanceData.instance?.qrcode,
        profileName: instanceData.instance?.profileName,
        phoneNumber: instanceData.instance?.owner,
        connected: instanceData.status?.connected || false,
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

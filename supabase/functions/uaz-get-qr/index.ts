import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { credentialId } = await req.json();
    
    console.log('[UAZ Get QR] Request for credential:', credentialId);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch credential from database
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError || !credential) {
      console.error('[UAZ Get QR] Credential not found:', credError);
      return new Response(
        JSON.stringify({ error: 'Credential not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Get QR] Fetching instance info from:', credential.subdomain);

    // Get instance info from UAZ API
    const instanceResponse = await fetch(`https://${credential.subdomain}.uazapi.com/instance/getinfo`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'token': credential.token,
      },
    });

    if (!instanceResponse.ok) {
      console.error('[UAZ Get QR] UAZ API error:', await instanceResponse.text());
      return new Response(
        JSON.stringify({ error: 'Failed to fetch instance info' }),
        { status: instanceResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const instanceData = await instanceResponse.json();
    console.log('[UAZ Get QR] Instance status:', instanceData.instance?.status);

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

    if (instanceData.status?.jid?.user) {
      updateData.phone_number = instanceData.status.jid.user;
    }

    const { error: updateError } = await supabaseClient
      .from('credentials')
      .update(updateData)
      .eq('id', credentialId);

    if (updateError) {
      console.error('[UAZ Get QR] Failed to update credential:', updateError);
    }

    return new Response(
      JSON.stringify({
        status: updateData.status,
        qrCode: updateData.qr_code,
        profileName: updateData.profile_name,
        phoneNumber: updateData.phone_number,
        connected: instanceData.status?.connected || false,
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
});

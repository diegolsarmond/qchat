import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get('Authorization');

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
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

    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { credentialId, chatId } = await req.json();
    
    console.log('[UAZ Fetch Contact Details] Fetching for chat:', chatId);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
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

    const { credentialId, chatId } = await req.json();

    console.log('[UAZ Fetch Contact Details] Fetching for chat:', chatId);

    // Fetch credential
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError) {
      console.error('[UAZ Fetch Contact Details] Failed to fetch credential:', credError);
    }

    const ownership = ensureCredentialOwnership(credential, authData.user.id, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }

    if (credential.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const ownedCredential = ownership.credential;

    // Fetch chat to get wa_chat_id
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('wa_chat_id')
      .eq('id', chatId)
      .eq('user_id', authData.user.id)
      .single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: 'Chat not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract phone number from wa_chat_id
    const phoneNumber = chat.wa_chat_id.split('@')[0];
    
    console.log('[UAZ Fetch Contact Details] Fetching from UAZ API for:', phoneNumber);

    // Fetch contact details from UAZ API using POST /chat/details
    const detailsResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/chat/details`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': ownedCredential.token,
      },
      body: JSON.stringify({
        number: phoneNumber,
        preview: false, // Get full resolution image
      }),
    });

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      console.error('[UAZ Fetch Contact Details] UAZ API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch contact details' }),
        { status: detailsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactDetails = await detailsResponse.json();
    
    console.log('[UAZ Fetch Contact Details] Got details for:', contactDetails.name);

    // Update chat with contact details
    await supabaseClient
      .from('chats')
      .update({
        name: contactDetails.name || contactDetails.wa_name || contactDetails.wa_contactName || phoneNumber,
        avatar: contactDetails.image || null,
      })
      .eq('id', chatId)
      .eq('user_id', authData.user.id);

    return new Response(
      JSON.stringify({ 
        name: contactDetails.name || contactDetails.wa_name || contactDetails.wa_contactName,
        avatar: contactDetails.image,
        phone: contactDetails.phone || phoneNumber,
        isGroup: contactDetails.wa_isGroup || false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Fetch Contact Details] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

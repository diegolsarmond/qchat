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
    const authorization = req.headers.get('Authorization');

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
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
    );

    // Fetch credential
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError || !credential) {
      return new Response(
        JSON.stringify({ error: 'Credential not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!credential.user_id) {
      return new Response(
        JSON.stringify({ error: 'Credential missing owner' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (credential.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch chat to get wa_chat_id
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('wa_chat_id')
      .eq('id', chatId)
      .eq('user_id', credential.user_id)
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
    const detailsResponse = await fetch(`https://${credential.subdomain}.uazapi.com/chat/details`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': credential.token,
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
      .eq('user_id', credential.user_id);

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

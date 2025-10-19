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
    
    console.log('[UAZ Fetch Chats] Fetching chats for credential:', credentialId);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    console.log('[UAZ Fetch Chats] Fetching from UAZ API');

    // Fetch chats from UAZ API
    const chatsResponse = await fetch(`https://${credential.subdomain}.uazapi.com/chats/getAll`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'token': credential.token,
      },
    });

    if (!chatsResponse.ok) {
      const errorText = await chatsResponse.text();
      console.error('[UAZ Fetch Chats] UAZ API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch chats' }),
        { status: chatsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chatsData = await chatsResponse.json();
    const chats = chatsData.chats || [];
    
    console.log('[UAZ Fetch Chats] Found chats:', chats.length);

    // Upsert chats to database
    for (const chat of chats) {
      try {
        await supabaseClient
          .from('chats')
          .upsert({
            credential_id: credentialId,
            wa_chat_id: chat.wa_chatid,
            name: chat.name || chat.wa_name || chat.wa_contactName || 'Unknown',
            last_message: chat.wa_lastMessageTextVote || '',
            last_message_timestamp: chat.wa_lastMsgTimestamp || 0,
            unread_count: chat.wa_unreadCount || 0,
            avatar: chat.image || '',
            is_group: chat.wa_isGroup || false,
          }, {
            onConflict: 'credential_id,wa_chat_id'
          });
      } catch (upsertError) {
        console.error('[UAZ Fetch Chats] Failed to upsert chat:', chat.wa_chatid, upsertError);
      }
    }

    // Fetch updated chats from database
    const { data: dbChats, error: dbError } = await supabaseClient
      .from('chats')
      .select('*')
      .eq('credential_id', credentialId)
      .order('last_message_timestamp', { ascending: false });

    if (dbError) {
      console.error('[UAZ Fetch Chats] Failed to fetch from DB:', dbError);
    }

    return new Response(
      JSON.stringify({ chats: dbChats || [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Fetch Chats] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

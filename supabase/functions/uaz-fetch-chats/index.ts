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

    const { credentialId, limit = 50, offset = 0 } = await req.json();
    
    console.log('[UAZ Fetch Chats] Fetching chats for credential:', credentialId);

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

    console.log('[UAZ Fetch Chats] Fetching from UAZ API');

    // Fetch chats from UAZ API using POST /chat/find
    const chatsResponse = await fetch(`https://${credential.subdomain}.uazapi.com/chat/find`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': credential.token,
      },
      body: JSON.stringify({
        operator: 'AND',
        sort: '-wa_lastMsgTimestamp',
        limit: limit,
        offset: offset
      })
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
            user_id: credential.user_id,
          }, {
            onConflict: 'credential_id,wa_chat_id'
          });
      } catch (upsertError) {
        console.error('[UAZ Fetch Chats] Failed to upsert chat:', chat.wa_chatid, upsertError);
      }
    }

    // Fetch updated chats from database with pagination
    const { data: dbChats, error: dbError, count } = await supabaseClient
      .from('chats')
      .select('*', { count: 'exact' })
      .eq('credential_id', credentialId)
      .eq('user_id', credential.user_id)
      .order('last_message_timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (dbError) {
      console.error('[UAZ Fetch Chats] Failed to fetch from DB:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        chats: dbChats || [],
        total: count || 0,
        hasMore: (count || 0) > (offset + limit)
      }),
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

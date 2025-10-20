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

    const { credentialId, limit = 50, offset = 0 } = await req.json();

    console.log('[UAZ Fetch Chats] Fetching chats for credential:', credentialId);

    // Fetch credential
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError) {
      console.error('[UAZ Fetch Chats] Failed to fetch credential:', credError);
    }

    const ownership = ensureCredentialOwnership(credential, authData.user.id, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }

    const ownedCredential = ownership.credential;

    console.log('[UAZ Fetch Chats] Fetching from UAZ API');

    // Fetch chats from UAZ API using POST /chat/find
    const chatsResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/chat/find`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': ownedCredential.token,
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
            user_id: authData.user.id,
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

    // Fetch updated chats from database with pagination
    const { data: dbChats, error: dbError, count } = await supabaseClient
      .from('chats')
      .select('*', { count: 'exact' })
      .eq('credential_id', credentialId)
      .eq('user_id', authData.user.id)
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

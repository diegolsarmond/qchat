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
    const { credentialId, chatId, limit = 50, offset = 0 } = await req.json();
    
    console.log('[UAZ Fetch Messages] Fetching messages for chat:', chatId);

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

    // Fetch chat
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('wa_chat_id')
      .eq('id', chatId)
      .single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: 'Chat not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Fetch Messages] Fetching from UAZ API for:', chat.wa_chat_id);

    // Fetch messages from UAZ API using POST /message/find
    const messagesResponse = await fetch(`https://${credential.subdomain}.uazapi.com/message/find`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': credential.token,
      },
      body: JSON.stringify({
        chatid: chat.wa_chat_id,
        limit: limit,
      }),
    });

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text();
      console.error('[UAZ Fetch Messages] UAZ API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch messages' }),
        { status: messagesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messagesData = await messagesResponse.json();
    const messages = messagesData.messages || [];
    
    console.log('[UAZ Fetch Messages] Found messages:', messages.length);

    // Upsert messages to database
    for (const msg of messages) {
      try {
        await supabaseClient
          .from('messages')
          .upsert({
            chat_id: chatId,
            wa_message_id: msg.messageid,
            content: msg.text || '',
            message_type: msg.messageType || 'text',
            from_me: msg.fromMe || false,
            sender: msg.sender || '',
            sender_name: msg.senderName || '',
            status: msg.status || '',
            message_timestamp: msg.messageTimestamp || 0,
          }, {
            onConflict: 'chat_id,wa_message_id'
          });
      } catch (upsertError) {
        console.error('[UAZ Fetch Messages] Failed to upsert message:', msg.messageid, upsertError);
      }
    }

    // Fetch updated messages from database with pagination
    const { data: dbMessages, error: dbError, count } = await supabaseClient
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('chat_id', chatId)
      .order('message_timestamp', { ascending: true })
      .range(offset, offset + limit - 1);

    if (dbError) {
      console.error('[UAZ Fetch Messages] Failed to fetch from DB:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        messages: dbMessages || [],
        total: count || 0,
        hasMore: (count || 0) > (offset + limit)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Fetch Messages] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

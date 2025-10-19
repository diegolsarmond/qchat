import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMessageStorage } from "../message-storage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      credentialId,
      chatId,
      limit = 50,
      offset = 0,
      order = 'asc',
    } = await req.json();

    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeOffset = Math.max(0, Number(offset) || 0);
    
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
        limit: safeLimit,
        offset: safeOffset,
        order,
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
        const storage = resolveMessageStorage({
          content: msg.text || '',
          messageType: msg.messageType || 'text',
          mediaType: msg.mediaType || null,
          caption: msg.caption || null,
          documentName: msg.documentName || null,
          mediaUrl: msg.mediaUrl || msg.url || null,
          mediaBase64: msg.mediaBase64 || msg.base64 || null,
        });

        await supabaseClient
          .from('messages')
          .upsert({
            chat_id: chatId,
            wa_message_id: msg.messageid,
            content: storage.content,
            message_type: storage.messageType,
            media_type: storage.mediaType,
            caption: storage.caption,
            document_name: storage.documentName,
            media_url: storage.mediaUrl,
            media_base64: storage.mediaBase64,
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
      .order('message_timestamp', { ascending: order !== 'desc' })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (dbError) {
      console.error('[UAZ Fetch Messages] Failed to fetch from DB:', dbError);
    }

    const normalizedMessages = order === 'desc'
      ? (dbMessages || []).slice().reverse()
      : (dbMessages || []);

    const returnedCount = Array.isArray(dbMessages) ? dbMessages.length : 0;
    const nextOffset = safeOffset + returnedCount;
    const hasMore = (count || 0) > nextOffset;

    return new Response(
      JSON.stringify({
        messages: normalizedMessages,
        total: count || 0,
        hasMore,
        nextOffset,
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

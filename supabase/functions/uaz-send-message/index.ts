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
    const {
      credentialId,
      chatId,
      content,
      messageType = 'text',
      mediaType,
      mediaUrl,
      mediaBase64,
      documentName,
      caption,
    } = await req.json();
    
    console.log('[UAZ Send Message] Sending to chat:', chatId);

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

    // Fetch chat to get wa_chat_id
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

    // Extract phone number from wa_chat_id (format: 5531XXXXXXXX@s.whatsapp.net)
    const phoneNumber = chat.wa_chat_id.split('@')[0];

    console.log('[UAZ Send Message] Sending to number:', phoneNumber);

    const resolvedMediaType = mediaType || (messageType !== 'text' && messageType !== 'media' ? messageType : undefined);
    const isMediaMessage = messageType === 'media' || !!resolvedMediaType || !!mediaUrl || !!mediaBase64;

    let apiPath = 'text';
    let apiBody: Record<string, unknown> = {
      number: phoneNumber,
      text: content,
    };
    let contentToStore = content;
    let typeToStore = messageType;
    const mediaDataToStore: Record<string, unknown> = {};

    if (isMediaMessage) {
      const finalMediaType = resolvedMediaType || mediaType;
      if (!finalMediaType) {
        return new Response(
          JSON.stringify({ error: 'Tipo de mídia é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!mediaUrl && !mediaBase64) {
        return new Response(
          JSON.stringify({ error: 'Origem da mídia é obrigatória' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiPath = 'media';
      apiBody = {
        number: phoneNumber,
        type: finalMediaType,
      };

      if (mediaUrl) {
        apiBody.url = mediaUrl;
      }

      if (mediaBase64) {
        apiBody.base64 = mediaBase64;
      }

      if (documentName) {
        apiBody.fileName = documentName;
      }

      if (caption) {
        apiBody.caption = caption;
      }

      contentToStore = caption || content || `[${finalMediaType}]`;
      typeToStore = 'media';
      mediaDataToStore.media_type = finalMediaType;
      mediaDataToStore.caption = caption ?? null;
      mediaDataToStore.document_name = documentName ?? null;
      mediaDataToStore.media_url = mediaUrl ?? null;
      mediaDataToStore.media_base64 = mediaBase64 ?? null;
    }

    const messageResponse = await fetch(`https://${credential.subdomain}.uazapi.com/send/${apiPath}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': credential.token,
      },
      body: JSON.stringify(apiBody),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error('[UAZ Send Message] UAZ API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send message' }),
        { status: messageResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messageData = await messageResponse.json();
    console.log('[UAZ Send Message] Message sent, ID:', messageData.Id);

    // Save message to database
    const timestamp = Date.now();
    const { error: insertError } = await supabaseClient
      .from('messages')
      .insert({
        chat_id: chatId,
        wa_message_id: messageData.Id || `msg_${timestamp}`,
        content: contentToStore,
        message_type: typeToStore,
        from_me: true,
        status: 'sent',
        message_timestamp: timestamp,
        ...mediaDataToStore,
      });

    if (insertError) {
      console.error('[UAZ Send Message] Failed to save message:', insertError);
    }

    // Update last message in chat
    await supabaseClient
        .from('chats')
        .update({
        last_message: contentToStore,
        last_message_timestamp: timestamp,
      })
      .eq('id', chatId);

    return new Response(
      JSON.stringify({ success: true, messageId: messageData.Id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Send Message] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

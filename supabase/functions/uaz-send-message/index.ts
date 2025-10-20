import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMessageStorage } from "../message-storage.ts";
import { buildUazMediaApiBody } from "./payload-helper.ts";

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

    if (!credential.user_id) {
      return new Response(
        JSON.stringify({ error: 'Credential missing owner' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Extract phone number from wa_chat_id (format: 5531XXXXXXXX@s.whatsapp.net)
    const phoneNumber = chat.wa_chat_id.split('@')[0];

    console.log('[UAZ Send Message] Sending to number:', phoneNumber);

    const {
      content: storageContent,
      messageType: storageMessageType,
      mediaType: storageMediaType,
      caption: storageCaption,
      documentName: storageDocumentName,
      mediaUrl: storageMediaUrl,
      mediaBase64: storageMediaBase64,
    } = resolveMessageStorage({
      content,
      messageType,
      mediaType,
      caption,
      documentName,
      mediaUrl,
      mediaBase64,
    });

    const isMediaMessage = storageMessageType === 'media';
    const finalMediaType = storageMediaType ?? mediaType ?? null;
    const normalizedFinalMediaType =
      finalMediaType && finalMediaType.toLowerCase() === 'ptt'
        ? 'audio'
        : finalMediaType;

    let apiPath = 'text';
    let apiBody: Record<string, unknown> = {
      number: phoneNumber,
      text: storageContent,
    };

    if (isMediaMessage) {
      if (!finalMediaType) {
        return new Response(
          JSON.stringify({ error: 'Tipo de mídia é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!storageMediaUrl && !storageMediaBase64) {
        return new Response(
          JSON.stringify({ error: 'Origem da mídia é obrigatória' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiPath = 'media';
      apiBody = buildUazMediaApiBody({
        phoneNumber,
        mediaType: normalizedFinalMediaType,
        mediaUrl: storageMediaUrl,
        mediaBase64: storageMediaBase64,
        caption: storageCaption,
        documentName: storageDocumentName,
      });
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
        credential_id: credentialId,
        wa_message_id: messageData.Id || `msg_${timestamp}`,
        content: storageContent,
        message_type: storageMessageType,
        media_type: storageMediaType,
        media_url: storageMediaUrl,
        media_base64: storageMediaBase64,
        document_name: storageDocumentName,
        caption: storageCaption,
        from_me: true,
        status: 'sent',
        message_timestamp: timestamp,
        is_private: false,
        user_id: credential.user_id,
      });

    if (insertError) {
      console.error('[UAZ Send Message] Failed to save message:', insertError);
    }

    // Update last message in chat
    await supabaseClient
      .from('chats')
      .update({
        last_message: storageContent,
        last_message_timestamp: timestamp,
      })
      .eq('id', chatId)
      .eq('user_id', credential.user_id);

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

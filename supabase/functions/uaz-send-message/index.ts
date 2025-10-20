import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMessageStorage } from "../message-storage.ts";
import { buildUazMediaApiBody, buildUazContactApiBody, UAZ_CONTACT_ENDPOINT } from "./payload-helper.ts";
import {
  buildUazMediaApiBody,
  buildUazLocationApiBody,
  UAZ_LOCATION_API_PATH,
} from "./payload-helper.ts";

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
      contactName,
      contactPhone,
      latitude,
      longitude,
      locationName,
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

    let apiPath = 'text';
    let apiBody: Record<string, unknown>;
    let storageContent = '';
    let storageMessageType: 'text' | 'media' | 'contact' = 'text';
    let storageMediaType: string | null = null;
    let storageCaption: string | null = null;
    let storageDocumentName: string | null = null;
    let storageMediaUrl: string | null = null;
    let storageMediaBase64: string | null = null;

    const normalizedType = (messageType ?? '').toString().toLowerCase();
    const isContactMessage = normalizedType === 'contact';

    if (isContactMessage) {
      const normalizedName = (contactName ?? '').toString().trim();
      const normalizedPhone = (contactPhone ?? '').toString().trim();

      if (!normalizedName || !normalizedPhone) {
    const isLocationMessage = messageType === 'location';

    let storageContent = content ?? '';
    let storageMessageType: 'text' | 'media' | 'location' = isLocationMessage ? 'location' : 'text';
    let storageMediaType: string | null = null;
    let storageCaption: string | null = null;
    let storageDocumentName: string | null = null;
    let storageMediaUrl: string | null = null;
    let storageMediaBase64: string | null = null;

    if (isLocationMessage) {
      const fallbackCoordinates =
        typeof latitude === 'number' && typeof longitude === 'number'
          ? `${latitude}, ${longitude}`
          : '';
      storageContent = storageContent || locationName || fallbackCoordinates;
    } else {
      const resolvedStorage = resolveMessageStorage({
        content,
        messageType,
        mediaType,
        caption,
        documentName,
        mediaUrl,
        mediaBase64,
      });

      storageContent = resolvedStorage.content;
      storageMessageType = resolvedStorage.messageType;
      storageMediaType = resolvedStorage.mediaType;
      storageCaption = resolvedStorage.caption;
      storageDocumentName = resolvedStorage.documentName;
      storageMediaUrl = resolvedStorage.mediaUrl;
      storageMediaBase64 = resolvedStorage.mediaBase64;
    }

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

    if (isLocationMessage) {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return new Response(
          JSON.stringify({ error: 'Coordenadas são obrigatórias' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiPath = UAZ_LOCATION_API_PATH;
      apiBody = buildUazLocationApiBody({
        phoneNumber,
        latitude,
        longitude,
        locationName: locationName ?? content ?? null,
      });
    } else if (isMediaMessage) {
      if (!finalMediaType) {
        return new Response(
          JSON.stringify({ error: 'Nome e telefone do contato são obrigatórios' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      apiPath = UAZ_CONTACT_ENDPOINT;
      apiBody = buildUazContactApiBody({
        phoneNumber,
        contactName: normalizedName,
        contactPhone: normalizedPhone,
        mediaType: normalizedFinalMediaType,
        mediaUrl: storageMediaUrl,
        mediaBase64: storageMediaBase64,
        caption: storageCaption,
        documentName: storageDocumentName,
      });

      storageContent = normalizedName;
      storageMessageType = 'contact';
    } else {
      const {
        content: resolvedContent,
        messageType: resolvedMessageType,
        mediaType: resolvedMediaType,
        caption: resolvedCaption,
        documentName: resolvedDocumentName,
        mediaUrl: resolvedMediaUrl,
        mediaBase64: resolvedMediaBase64,
      } = resolveMessageStorage({
        content,
        messageType,
        mediaType,
        caption,
        documentName,
        mediaUrl,
        mediaBase64,
      });

      storageContent = resolvedContent;
      storageMessageType = resolvedMessageType;
      storageMediaType = resolvedMediaType;
      storageCaption = resolvedCaption;
      storageDocumentName = resolvedDocumentName;
      storageMediaUrl = resolvedMediaUrl;
      storageMediaBase64 = resolvedMediaBase64;

      const isMediaMessage = storageMessageType === 'media';
      const finalMediaType = storageMediaType ?? mediaType ?? null;

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
          mediaType: finalMediaType,
          mediaUrl: storageMediaUrl,
          mediaBase64: storageMediaBase64,
          caption: storageCaption,
          documentName: storageDocumentName,
        });
      } else {
        apiBody = {
          number: phoneNumber,
          text: storageContent,
        };
      }
    }

    if (!apiBody) {
      apiBody = {
        number: phoneNumber,
        text: storageContent,
      };
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

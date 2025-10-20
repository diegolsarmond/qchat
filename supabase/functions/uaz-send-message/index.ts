import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMessageStorage } from "../message-storage.ts";
import {
  buildUazMediaApiBody,
  buildUazInteractiveApiBody,
  UAZ_MENU_ENDPOINT,
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
      interactive,
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

    const normalizedMessageType = typeof messageType === 'string' ? messageType : 'text';

    let storageContent = typeof content === 'string' ? content : '';
    let storageMessageType: 'text' | 'media' | 'interactive' = 'text';
    let storageMediaType: string | null = null;
    let storageCaption: string | null = null;
    let storageDocumentName: string | null = null;
    let storageMediaUrl: string | null = null;
    let storageMediaBase64: string | null = null;

    let apiPath = 'text';
    let apiBody: Record<string, unknown> = {
      number: phoneNumber,
      text: storageContent,
    };

    if (normalizedMessageType === 'interactive') {
      const rawType = typeof interactive?.type === 'string' ? interactive.type.toLowerCase() : '';
      if (rawType !== 'buttons' && rawType !== 'list') {
        return new Response(
          JSON.stringify({ error: 'Tipo de menu inválido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const bodyText = typeof interactive?.body === 'string' ? interactive.body.trim() : '';
      if (!bodyText) {
        return new Response(
          JSON.stringify({ error: 'Corpo do menu é obrigatório' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const headerText = typeof interactive?.header === 'string' ? interactive.header.trim() : '';
      const footerText = typeof interactive?.footer === 'string' ? interactive.footer.trim() : '';

      const sanitized: {
        type: 'buttons' | 'list';
        body: string;
        header?: string;
        footer?: string;
        button?: string;
        buttons?: { id: string; title: string }[];
        sections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      } = {
        type: rawType as 'buttons' | 'list',
        body: bodyText,
      };

      if (headerText) {
        sanitized.header = headerText;
      }

      if (footerText) {
        sanitized.footer = footerText;
      }

      if (sanitized.type === 'buttons') {
        const buttons = Array.isArray(interactive?.buttons)
          ? interactive.buttons
              .map((button: unknown) => {
                if (typeof button !== 'object' || button === null) {
                  return null;
                }
                const id = typeof (button as any).id === 'string' ? (button as any).id.trim() : '';
                const title = typeof (button as any).title === 'string' ? (button as any).title.trim() : '';
                if (!id || !title) {
                  return null;
                }
                return { id, title };
              })
              .filter((button): button is { id: string; title: string } => Boolean(button))
          : [];

        if (!buttons.length) {
          return new Response(
            JSON.stringify({ error: 'Botões do menu são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        sanitized.buttons = buttons;
      } else {
        const buttonLabel = typeof interactive?.button === 'string' ? interactive.button.trim() : '';
        sanitized.button = buttonLabel || 'Selecionar';

        const sections = Array.isArray(interactive?.sections)
          ? interactive.sections
              .map((section: unknown) => {
                if (typeof section !== 'object' || section === null) {
                  return null;
                }
                const sectionTitle = typeof (section as any).title === 'string' ? (section as any).title.trim() : '';
                const rows = Array.isArray((section as any).rows)
                  ? (section as any).rows
                      .map((row: unknown) => {
                        if (typeof row !== 'object' || row === null) {
                          return null;
                        }
                        const id = typeof (row as any).id === 'string' ? (row as any).id.trim() : '';
                        const title = typeof (row as any).title === 'string' ? (row as any).title.trim() : '';
                        const description = typeof (row as any).description === 'string'
                          ? (row as any).description.trim()
                          : '';
                        if (!id || !title) {
                          return null;
                        }
                        return {
                          id,
                          title,
                          ...(description ? { description } : {}),
                        };
                      })
                      .filter((row): row is { id: string; title: string; description?: string } => Boolean(row))
                  : [];

                if (!rows.length) {
                  return null;
                }

                return {
                  ...(sectionTitle ? { title: sectionTitle } : {}),
                  rows,
                };
              })
              .filter((section): section is { title?: string; rows: { id: string; title: string; description?: string }[] } => Boolean(section))
          : [];

        if (!sections.length) {
          return new Response(
            JSON.stringify({ error: 'Opções da lista são obrigatórias' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        sanitized.sections = sections;
      }

      storageContent = bodyText;
      storageMessageType = 'interactive';
      storageMediaType = null;
      storageCaption = null;
      storageDocumentName = null;
      storageMediaUrl = null;
      storageMediaBase64 = null;

      apiPath = UAZ_MENU_ENDPOINT;
      apiBody = buildUazInteractiveApiBody({
        phoneNumber,
        menu: sanitized,
      });
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

      apiBody = {
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
          mediaType: finalMediaType,
          mediaUrl: storageMediaUrl,
          mediaBase64: storageMediaBase64,
          caption: storageCaption,
          documentName: storageDocumentName,
        });
      }
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

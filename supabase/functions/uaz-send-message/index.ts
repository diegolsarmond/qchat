import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMessageStorage } from "../message-storage.ts";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import {
  buildUazMediaApiBody,
  buildUazInteractiveApiBody,
  buildUazContactApiBody,
  buildUazLocationApiBody,
  UAZ_MENU_ENDPOINT,
  UAZ_CONTACT_ENDPOINT,
  UAZ_LOCATION_API_PATH,
} from "./payload-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    let accessToken = typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? null;
    if (anonKey && accessToken === anonKey) {
      accessToken = null;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const clientOptions = accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          auth: { autoRefreshToken: false, persistSession: false },
        }
      : { auth: { autoRefreshToken: false, persistSession: false } };

    const supabaseClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      clientOptions,
    );

    let userId: string | null = null;

    if (accessToken) {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

      if (authError || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Credenciais inválidas" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      userId = authData.user.id;
    }

    const {
      credentialId,
      chatId,
      content,
      messageType = "text",
      mediaType,
      mediaUrl,
      mediaBase64,
      documentName,
      caption,
      interactive,
      contactName,
      contactPhone,
      latitude,
      longitude,
      locationName,
    } = await req.json();

    console.log("[UAZ Send Message] Sending to chat:", chatId);

    const { data: credential, error: credError } = await supabaseClient
      .from("credentials")
      .select("*")
      .eq("id", credentialId)
      .single();

    if (credError) {
      console.error("[UAZ Send Message] Failed to fetch credential:", credError);
    }

    let isMember = false;
    let membershipRole: string | null = null;

    if (credential && userId) {
      const { data: membership } = await supabaseClient
        .from('credential_members')
        .select('user_id, role')
        .eq('credential_id', credentialId)
        .eq('user_id', userId)
        .maybeSingle();

      isMember = Boolean(membership);
      if (membership && typeof membership.role === 'string') {
        membershipRole = membership.role;
      }
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders, { isMember });

    if (ownership.response) {
      return ownership.response;
    }

    const ownedCredential = ownership.credential;

    let chatQuery = supabaseClient
      .from("chats")
      .select("wa_chat_id, credential_id, assigned_to")
      .eq("id", chatId)
      .eq("credential_id", credentialId);

    const { data: chat, error: chatError } = await chatQuery.single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: "Chat not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedRole = typeof membershipRole === "string" ? membershipRole.toLowerCase() : null;
    const isCredentialOwner = ownedCredential.user_id === userId;
    const hasElevatedMembership = normalizedRole === "owner" || normalizedRole === "admin";

    if (!isCredentialOwner && !hasElevatedMembership && userId && chat.assigned_to !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const phoneNumber = chat.wa_chat_id.split("@")[0];

    console.log("[UAZ Send Message] Sending to number:", phoneNumber);

    const normalizedMessageType = typeof messageType === "string" ? messageType.toLowerCase() : "text";

    let storageContent = typeof content === "string" ? content : "";
    let storageMessageType: "text" | "media" | "interactive" | "contact" | "location" = "text";
    let storageMediaType: string | null = null;
    let storageCaption: string | null = null;
    let storageDocumentName: string | null = null;
    let storageMediaUrl: string | null = null;
    let storageMediaBase64: string | null = null;

    let apiPath = "text";
    let apiBody: Record<string, unknown>;

    if (normalizedMessageType === "interactive") {
      const rawType = typeof interactive?.type === "string" ? interactive.type.toLowerCase() : "";

      if (rawType !== "buttons" && rawType !== "list") {
        return new Response(
          JSON.stringify({ error: "Tipo de menu inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const bodyText = typeof interactive?.body === "string" ? interactive.body.trim() : "";

      if (!bodyText) {
        return new Response(
          JSON.stringify({ error: "Corpo do menu é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const headerText = typeof interactive?.header === "string" ? interactive.header.trim() : "";
      const footerText = typeof interactive?.footer === "string" ? interactive.footer.trim() : "";

      const sanitized: {
        type: "buttons" | "list";
        body: string;
        header?: string;
        footer?: string;
        button?: string;
        buttons?: { id: string; title: string }[];
        sections?: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      } = {
        type: rawType as "buttons" | "list",
        body: bodyText,
      };

      if (headerText) {
        sanitized.header = headerText;
      }

      if (footerText) {
        sanitized.footer = footerText;
      }

      if (sanitized.type === "buttons") {
        const buttons = Array.isArray(interactive?.buttons)
          ? interactive.buttons
            .map((button: unknown) => {
              if (typeof button !== "object" || button === null) {
                return null;
              }

              const id = typeof (button as any).id === "string" ? (button as any).id.trim() : "";
              const title = typeof (button as any).title === "string" ? (button as any).title.trim() : "";

              if (!id || !title) {
                return null;
              }

              return { id, title };
            })
            .filter((button: any): button is { id: string; title: string } => Boolean(button))
          : [];

        if (!buttons.length) {
          return new Response(
            JSON.stringify({ error: "Botões do menu são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        sanitized.buttons = buttons;
      } else {
        const buttonLabel = typeof interactive?.button === "string" ? interactive.button.trim() : "";
        sanitized.button = buttonLabel || "Selecionar";

        const sections = Array.isArray(interactive?.sections)
          ? interactive.sections
            .map((section: unknown) => {
              if (typeof section !== "object" || section === null) {
                return null;
              }

              const sectionTitle = typeof (section as any).title === "string" ? (section as any).title.trim() : "";
              const rows = Array.isArray((section as any).rows)
                ? (section as any).rows
                  .map((row: unknown) => {
                    if (typeof row !== "object" || row === null) {
                      return null;
                    }

                    const id = typeof (row as any).id === "string" ? (row as any).id.trim() : "";
                    const title = typeof (row as any).title === "string" ? (row as any).title.trim() : "";
                    const description = typeof (row as any).description === "string"
                      ? (row as any).description.trim()
                      : "";

                    if (!id || !title) {
                      return null;
                    }

                    return {
                      id,
                      title,
                      ...(description ? { description } : {}),
                    };
                  })
                  .filter((row: any): row is { id: string; title: string; description?: string } => Boolean(row))
                : [];

              if (!rows.length) {
                return null;
              }

              return {
                ...(sectionTitle ? { title: sectionTitle } : {}),
                rows,
              };
            })
            .filter((section: any): section is { title?: string; rows: { id: string; title: string; description?: string }[] } => Boolean(section))
          : [];

        if (!sections.length) {
          return new Response(
            JSON.stringify({ error: "Opções da lista são obrigatórias" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        sanitized.sections = sections;
      }

      storageContent = bodyText;
      storageMessageType = "interactive";
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
    } else if (normalizedMessageType === "contact") {
      const normalizedName = (contactName ?? "").toString().trim();
      const normalizedPhone = (contactPhone ?? "").toString().trim();

      if (!normalizedName || !normalizedPhone) {
        return new Response(
          JSON.stringify({ error: "Nome e telefone do contato são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      storageContent = normalizedName;
      storageMessageType = "contact";
      storageMediaType = null;
      storageCaption = null;
      storageDocumentName = null;
      storageMediaUrl = null;
      storageMediaBase64 = null;

      apiPath = UAZ_CONTACT_ENDPOINT;
      apiBody = buildUazContactApiBody({
        phoneNumber,
        contactName: normalizedName,
        contactPhone: normalizedPhone,
      });
    } else if (normalizedMessageType === "location") {
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return new Response(
          JSON.stringify({ error: "Coordenadas são obrigatórias" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fallbackCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
        ? `${latitude}, ${longitude}`
        : "";

      const label = typeof locationName === "string" && locationName.trim()
        ? locationName.trim()
        : typeof content === "string" && content.trim()
          ? content.trim()
          : null;

      storageContent = label ?? fallbackCoordinates;
      storageMessageType = "location";
      storageMediaType = null;
      storageCaption = null;
      storageDocumentName = null;
      storageMediaUrl = null;
      storageMediaBase64 = null;

      apiPath = UAZ_LOCATION_API_PATH;
      apiBody = buildUazLocationApiBody({
        phoneNumber,
        latitude,
        longitude,
        locationName: label,
      });
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

      if (storageMessageType === "media") {
        const finalMediaType = storageMediaType ?? (typeof mediaType === "string" ? mediaType : null);

        if (!finalMediaType) {
          return new Response(
            JSON.stringify({ error: "Tipo de mídia é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (!storageMediaUrl && !storageMediaBase64) {
          return new Response(
            JSON.stringify({ error: "Origem da mídia é obrigatória" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        apiPath = "media";
        apiBody = buildUazMediaApiBody({
          phoneNumber,
          mediaType: finalMediaType,
          mediaUrl: storageMediaUrl,
          mediaBase64: storageMediaBase64,
          caption: storageCaption,
          documentName: storageDocumentName,
        });
      } else {
        apiPath = "text";
        apiBody = {
          number: phoneNumber,
          text: storageContent,
        };
      }
    }

    const messageResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/send/${apiPath}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token: ownedCredential.token,
      },
      body: JSON.stringify(apiBody),
    });

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text();
      console.error("[UAZ Send Message] UAZ API error:", errorText);
      return new Response(
        JSON.stringify({ error: errorText || "Failed to send message" }),
        { status: messageResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messageData = await messageResponse.json();
    console.log("[UAZ Send Message] Message sent, ID:", messageData.Id);

    const timestamp = Date.now();
    const { error: insertError } = await supabaseClient
      .from("messages")
      .insert({
        chat_id: chatId,
        credential_id: credentialId,
        ...(userId ? { user_id: userId } : {}),
        wa_message_id: messageData.Id || `msg_${timestamp}`,
        content: storageContent,
        message_type: storageMessageType,
        media_type: storageMediaType,
        media_url: storageMediaUrl,
        media_base64: storageMediaBase64,
        document_name: storageDocumentName,
        caption: storageCaption,
        from_me: true,
        status: "sent",
        message_timestamp: timestamp,
        is_private: false,
      });

    if (insertError) {
      console.error("[UAZ Send Message] Failed to save message:", insertError);
    }

    let updateQuery = supabaseClient
      .from("chats")
      .update({
        last_message: storageContent,
        last_message_timestamp: timestamp,
      })
      .eq("id", chatId);

    if (userId) {
      updateQuery = updateQuery.eq("user_id", userId);
    }

    await updateQuery;

    return new Response(
      JSON.stringify({ success: true, messageId: messageData.Id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[UAZ Send Message] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

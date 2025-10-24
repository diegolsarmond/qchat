import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    let accessToken = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? null;
    if (anonKey && accessToken === anonKey) {
      accessToken = null;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const clientOptions = accessToken
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        }
      : undefined;

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
          JSON.stringify({ error: 'Credenciais inválidas' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
    }

    const { credentialId, chatId } = await req.json();

    console.log('[UAZ Fetch Contact Details] Fetching for chat:', chatId);

    // Fetch credential
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError) {
      console.error('[UAZ Fetch Contact Details] Failed to fetch credential:', credError);
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }
    const ownedCredential = ownership.credential;

    // Fetch chat to get wa_chat_id
    let chatQuery = supabaseClient
      .from('chats')
      .select('wa_chat_id')
      .eq('id', chatId);

    if (userId) {
      chatQuery = chatQuery.eq('user_id', userId);
    }

    const { data: chat, error: chatError } = await chatQuery.single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: 'Chat not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract phone number from wa_chat_id
    const phoneNumber = chat.wa_chat_id.split('@')[0];
    
    console.log('[UAZ Fetch Contact Details] Fetching from UAZ API for:', phoneNumber);

    // Fetch contact details from UAZ API using POST /chat/details
    const detailsResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/chat/details`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': ownedCredential.token,
      },
      body: JSON.stringify({
        number: phoneNumber,
        preview: false, // Get full resolution image
      }),
    });

    if (!detailsResponse.ok) {
      const errorText = await detailsResponse.text();
      console.error('[UAZ Fetch Contact Details] UAZ API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch contact details' }),
        { status: detailsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactDetails = await detailsResponse.json();
    
    console.log('[UAZ Fetch Contact Details] Got details for:', contactDetails.name);

    // Update chat with contact details
    let updateQuery = supabaseClient
      .from('chats')
      .update({
        name: contactDetails.name || contactDetails.wa_name || contactDetails.wa_contactName || phoneNumber,
        avatar: contactDetails.image || null,
      })
      .eq('id', chatId);

    if (userId) {
      updateQuery = updateQuery.eq('user_id', userId);
    }

    await updateQuery;

    return new Response(
      JSON.stringify({
        name: contactDetails.name || contactDetails.wa_name || contactDetails.wa_contactName,
        avatar: contactDetails.image,
        phone: contactDetails.phone || phoneNumber,
        isGroup: contactDetails.wa_isGroup || false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[UAZ Fetch Contact Details] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);

export { handler };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { upsertFetchedMessages } from "./upsert-messages.ts";

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

    const {
      credentialId,
      chatId,
      limit = 50,
      offset = 0,
      order = 'asc',
    } = await req.json();

    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeOffset = Math.max(0, Number(offset) || 0);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    console.log('[UAZ Fetch Messages] Fetching messages for chat:', chatId);

    // Fetch credential
    const { data: credential, error: credError } = await supabaseClient
      .from('credentials')
      .select('*')
      .eq('id', credentialId)
      .single();

    if (credError) {
      console.error('[UAZ Fetch Messages] Failed to fetch credential:', credError);
    }

    const ownership = ensureCredentialOwnership(credential, authData.user.id, corsHeaders);

    if (ownership.response) {
      return ownership.response;
    }

    if (credential.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const ownedCredential = ownership.credential;

    // Fetch chat
    const { data: chat, error: chatError } = await supabaseClient
      .from('chats')
      .select('wa_chat_id')
      .eq('id', chatId)
      .eq('user_id', authData.user.id)
      .single();

    if (chatError || !chat) {
      return new Response(
        JSON.stringify({ error: 'Chat not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[UAZ Fetch Messages] Fetching from UAZ API for:', chat.wa_chat_id);

    // Fetch messages from UAZ API using POST /message/find
    const messagesResponse = await fetch(`https://${ownedCredential.subdomain}.uazapi.com/message/find`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': ownedCredential.token,
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

    await upsertFetchedMessages({
      supabaseClient,
      messages,
      chatId,
      credentialId,
      userId: authData.user.id,
    });

    // Fetch updated messages from database with pagination
    const { data: dbMessages, error: dbError, count } = await supabaseClient
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('chat_id', chatId)
      .eq('user_id', authData.user.id)
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

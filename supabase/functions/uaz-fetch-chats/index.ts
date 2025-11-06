import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureCredentialOwnership } from "../_shared/credential-guard.ts";
import { persistChats } from "./upsert-chats.ts";

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

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Credenciais ausentes' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    let metadataRoles: string[] = [];
    let userRole: string | null = null;
    let isAdminRole = false;
    let isSupervisorRole = false;

    if (accessToken) {
      const { data: authData, error: authError } = await supabaseClient.auth.getUser(accessToken);

      if (authError || !authData?.user) {
        return new Response(
          JSON.stringify({ error: 'Credenciais inválidas' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
      const appMetadata = (authData.user as { app_metadata?: Record<string, unknown> | undefined })?.app_metadata ?? {};
      const directRole = typeof appMetadata.role === 'string' ? appMetadata.role.toLowerCase() : null;
      const metadataRolesValue = Array.isArray((appMetadata as { roles?: unknown }).roles)
        ? ((appMetadata as { roles?: string[] }).roles ?? [])
        : [];
      metadataRoles = [
        directRole,
        ...metadataRolesValue
          .filter((role): role is string => typeof role === 'string' && role.trim().length > 0)
          .map(role => role.toLowerCase()),
      ].filter((role): role is string => Boolean(role));
      if (appMetadata.is_admin === true) {
        metadataRoles.push('admin');
      }
      if (appMetadata.is_supervisor === true) {
        metadataRoles.push('supervisor');
      }
      const allowedRoles = ['admin', 'supervisor', 'agent', 'owner'];
      userRole = metadataRoles.find(role => allowedRoles.includes(role)) ?? null;
      isAdminRole = metadataRoles.includes('admin') || metadataRoles.includes('owner');
      isSupervisorRole = metadataRoles.includes('supervisor');
    }

    const rawBody = await req.text();
    const parsedBody = rawBody.trim().length > 0 ? JSON.parse(rawBody) : {};
    const { credentialId, limit = 50, offset = 0 } = parsedBody as {
      credentialId?: string;
      limit?: number;
      offset?: number;
    };

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

    let isMember = false;

    if (credential && userId && credential.user_id !== userId) {
      const { data: membership } = await supabaseClient
        .from('credential_members')
        .select('user_id, role')
        .eq('credential_id', credentialId)
        .eq('user_id', userId)
        .maybeSingle();

      isMember = Boolean(membership);
      const membershipRole = typeof membership?.role === 'string' ? membership.role : null;
      const normalizedMembershipRole = membershipRole ? membershipRole.toLowerCase() : null;
      if (!userRole && normalizedMembershipRole && ['admin', 'supervisor', 'agent', 'owner'].includes(normalizedMembershipRole)) {
        userRole = normalizedMembershipRole;
      }
      if (normalizedMembershipRole === 'admin' || normalizedMembershipRole === 'owner') {
        isAdminRole = true;
      }
      if (normalizedMembershipRole === 'supervisor') {
        isSupervisorRole = true;
      }
    }

    const ownership = ensureCredentialOwnership(credential, userId, corsHeaders, { isMember });

    if (ownership.response) {
      return ownership.response;
    }
    const ownedCredential = ownership.credential;

    const credentialOwnerId = typeof ownedCredential.user_id === 'string' && ownedCredential.user_id.length > 0
      ? ownedCredential.user_id
      : null;
    const isCredentialOwner = ownedCredential.user_id === userId;
    if (isCredentialOwner) {
      userRole = userRole ?? 'owner';
      isAdminRole = true;
    }

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: 'Papel não autorizado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const canManageCredential = isCredentialOwner || isAdminRole || isSupervisorRole;

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
        JSON.stringify({ error: errorText || 'Failed to fetch chats' }),
        { status: chatsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chatsData = await chatsResponse.json();
    const chats = chatsData.chats || [];
    
    console.log('[UAZ Fetch Chats] Found chats:', chats.length);

    // Upsert chats to database
    try {
      await persistChats({
        supabaseClient,
        credentialId,
        chats,
        credentialUserId: credentialOwnerId ?? undefined,
      });
    } catch (upsertError) {
      console.error('[UAZ Fetch Chats] Failed to upsert chats:', upsertError);
    }

    // Fetch updated chats from database with pagination
    let shouldFilterByUserId = Boolean(credentialOwnerId);

    if (shouldFilterByUserId) {
      try {
        const { data: scopedData } = await supabaseClient
          .from('chats')
          .select('user_id')
          .eq('credential_id', credentialId)
          .not('user_id', 'is', null)
          .limit(1);

        if (!scopedData || scopedData.length === 0) {
          shouldFilterByUserId = false;
        }
      } catch (_error) {
        shouldFilterByUserId = false;
      }
    }

    let chatsQuery = supabaseClient
      .from('chats')
      .select('*, chat_labels(label:labels(id,name,color))', { count: 'exact' })
      .eq('credential_id', credentialId)
      .order('last_message_timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    if (shouldFilterByUserId && credentialOwnerId) {
      chatsQuery = chatsQuery.eq('user_id', credentialOwnerId);
    }

    if (!canManageCredential && userId) {
      chatsQuery = chatsQuery.eq('assigned_to', userId);
    }

    const { data: dbChats, error: dbError, count } = await chatsQuery;

    const normalizedChats = (dbChats || []).map((chat) => {
      const chatLabels = Array.isArray((chat as { chat_labels?: unknown }).chat_labels)
        ? (chat as { chat_labels: Array<{ label?: { id?: unknown; name?: unknown; color?: unknown } | null }> }).chat_labels
        : [];

      const labels = chatLabels
        .map((item) => {
          const label = item?.label;
          const id = typeof label?.id === 'string' ? label.id : null;
          if (!id) {
            return null;
          }
          const name = typeof label?.name === 'string' ? label.name : '';
          const color = typeof label?.color === 'string' ? label.color : null;
          return { id, name, color };
        })
        .filter((value): value is { id: string; name: string; color: string | null } => Boolean(value));

      const { chat_labels, ...rest } = chat as { chat_labels?: unknown } & Record<string, unknown>;

      const attendanceStatus = (rest.attendance_status as string | null | undefined) ?? 'waiting';

      if (labels.length > 0) {
        return {
          ...rest,
          attendance_status: attendanceStatus,
          labels,
        };
      }

      return {
        ...rest,
        attendance_status: attendanceStatus,
      };
    });

    if (dbError) {
      console.error('[UAZ Fetch Chats] Failed to fetch from DB:', dbError);
    }

    return new Response(
      JSON.stringify({
        chats: normalizedChats,
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
};

serve(handler);

export { handler };

export interface PersistChatsParams {
  supabaseClient: any;
  credentialId: string;
  chats: Array<Record<string, unknown>>;
  credentialUserId?: string | null;
}

export function mapChatsToRecords(params: {
  chats: Array<Record<string, unknown>>;
  credentialId: string;
  credentialUserId?: string | null;
}) {
  const { chats, credentialId, credentialUserId } = params;

  return chats.map((chat) => ({
    credential_id: credentialId,
    wa_chat_id: chat.wa_chatid,
    name: (chat.name as string) || (chat.wa_name as string) || (chat.wa_contactName as string) || 'Unknown',
    last_message: (chat.wa_lastMessageTextVote as string) || '',
    last_message_timestamp: (chat.wa_lastMsgTimestamp as number) || 0,
    unread_count: (chat.wa_unreadCount as number) || 0,
    avatar: (chat.image as string) || '',
    is_group: (chat.wa_isGroup as boolean) || false,
    ...(credentialUserId ? { user_id: credentialUserId } : {}),
  }));
  return chats.map((chat) => {
    const attendanceStatus = typeof chat.attendance_status === 'string'
      ? chat.attendance_status
      : typeof chat.attendanceStatus === 'string'
        ? chat.attendanceStatus
        : undefined;

    const record: Record<string, unknown> = {
      credential_id: credentialId,
      wa_chat_id: chat.wa_chatid,
      name: (chat.name as string) || (chat.wa_name as string) || (chat.wa_contactName as string) || 'Unknown',
      last_message: (chat.wa_lastMessageTextVote as string) || '',
      last_message_timestamp: (chat.wa_lastMsgTimestamp as number) || 0,
      unread_count: (chat.wa_unreadCount as number) || 0,
      avatar: (chat.image as string) || '',
      is_group: (chat.wa_isGroup as boolean) || false,
    };

    if (attendanceStatus) {
      record.attendance_status = attendanceStatus;
    }

    return record;
  });
}

export async function persistChats(params: PersistChatsParams) {
  const { supabaseClient, credentialId, chats, credentialUserId } = params;
  const records = mapChatsToRecords({ chats, credentialId, credentialUserId });

  if (records.length === 0) {
    return;
  }

  return supabaseClient
    .from('chats')
    .upsert(records, { onConflict: 'credential_id,wa_chat_id' });
}

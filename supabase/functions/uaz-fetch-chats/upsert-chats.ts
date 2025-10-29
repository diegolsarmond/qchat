export interface PersistChatsParams {
  supabaseClient: any;
  credentialId: string;
  chats: Array<Record<string, unknown>>;
  credentialUserId?: string | null;
  userId?: string | null;
}

export function mapChatsToRecords(params: {
  chats: Array<Record<string, unknown>>;
  credentialId: string;
  credentialUserId?: string | null;
}) {
  const { chats, credentialId, credentialUserId } = params;

  const userId = typeof credentialUserId === 'string' && credentialUserId.length > 0
    ? credentialUserId
    : null;

  return chats.map((chat) => {
    const rawAttendanceStatus = typeof chat.attendance_status === 'string'
      ? chat.attendance_status
      : typeof chat.attendanceStatus === 'string'
        ? chat.attendanceStatus
        : undefined;

    const normalizedAttendanceStatus = typeof rawAttendanceStatus === 'string'
      ? rawAttendanceStatus.trim().toLowerCase()
      : undefined;

    const attendanceMap: Record<string, string> = {
      finished: 'finished',
      finalized: 'finished',
      closed: 'finished',
      in_service: 'in_service',
      'in progress': 'in_service',
      in_progress: 'in_service',
      active: 'in_service',
      waiting: 'waiting',
      pending: 'waiting',
      queued: 'waiting',
    };

    const attendanceStatus = normalizedAttendanceStatus
      ? attendanceMap[normalizedAttendanceStatus]
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

    if (credentialUserId) {
      record.user_id = credentialUserId;
    }

    if (attendanceStatus) {
      record.attendance_status = attendanceStatus;
    }

    if (userId) {
      record.user_id = userId;
    }

    return record;
  });
}

export async function persistChats(params: PersistChatsParams) {
  const { supabaseClient, credentialId, chats } = params;
  const credentialUserId = params.credentialUserId ?? params.userId;
  const records = mapChatsToRecords({ chats, credentialId, credentialUserId });

  if (records.length === 0) {
    return;
  }

  return supabaseClient
    .from('chats')
    .upsert(records, { onConflict: 'credential_id,wa_chat_id' });
}

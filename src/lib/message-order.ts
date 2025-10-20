import type { Message } from "@/types/whatsapp";

export const normalizeFetchedMessages = (messages: Message[]): Message[] => {
  const normalized = [...messages].reverse();
  return normalized;
};

export const mergeFetchedMessages = (
  previous: Message[],
  fetched: Message[],
  reset: boolean,
): Message[] => {
  const normalized = normalizeFetchedMessages(fetched);
  if (reset) {
    return normalized;
  }

  if (!normalized.length) {
    return previous;
  }

  const updates = new Map(normalized.map(message => [message.id, message]));
  const existingIds = new Set(previous.map(message => message.id));
  const updatedPrevious = previous.map(message => {
    const updated = updates.get(message.id);
    return updated ? { ...message, ...updated } : message;
  });
  const filtered = normalized.filter(message => !existingIds.has(message.id));

  if (!filtered.length) {
    return updatedPrevious;
  }

  return [...filtered, ...updatedPrevious];
};

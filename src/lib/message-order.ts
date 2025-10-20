import type { Message } from "@/types/whatsapp";

export const normalizeFetchedMessages = (messages: Message[]): Message[] => {
  return [...messages].reverse();
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

  const existingIds = new Set(previous.map(message => message.id));
  const filtered = normalized.filter(message => !existingIds.has(message.id));

  if (!filtered.length) {
    return previous;
  }

  return [...filtered, ...previous];
};

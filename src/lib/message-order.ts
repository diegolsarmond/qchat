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
  return reset ? normalized : [...normalized, ...previous];
};

import type { Message } from "@/types/whatsapp";

const getOrderValue = (message: Message): number | string => {
  if (message.timestamp) {
    const parsed = Date.parse(message.timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return message.timestamp;
  }

  const numericId = Number(message.id);
  if (!Number.isNaN(numericId)) {
    return numericId;
  }

  return message.id;
};

const compareMessages = (a: Message, b: Message): number => {
  const valueA = getOrderValue(a);
  const valueB = getOrderValue(b);

  if (typeof valueA === "number" && typeof valueB === "number") {
    return valueA - valueB;
  }

  const stringA = String(valueA);
  const stringB = String(valueB);

  if (stringA < stringB) {
    return -1;
  }
  if (stringA > stringB) {
    return 1;
  }

  return 0;
};

export const normalizeFetchedMessages = (messages: Message[]): Message[] => {
  const normalized = [...messages];

  for (let index = 1; index < normalized.length; index += 1) {
    if (compareMessages(normalized[index - 1], normalized[index]) > 0) {
      return normalized.reverse();
    }
  }

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

  const merged = [...updatedPrevious, ...filtered];

  return merged.sort(compareMessages);
};

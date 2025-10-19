export interface MessageStorageInput {
  content?: string | null;
  messageType?: string | null;
  mediaType?: string | null;
  caption?: string | null;
  documentName?: string | null;
  mediaUrl?: string | null;
  mediaBase64?: string | null;
}

export interface MessageStorageResult {
  content: string;
  messageType: 'text' | 'media';
  mediaType: string | null;
  caption: string | null;
  documentName: string | null;
  mediaUrl: string | null;
  mediaBase64: string | null;
}

const isNonEmpty = (value?: string | null) =>
  typeof value === 'string' && value.trim().length > 0;

export const resolveMessageStorage = (
  input: MessageStorageInput,
): MessageStorageResult => {
  const normalizedContent = input.content ?? '';
  const rawType = input.messageType ?? '';
  const normalizedType = rawType.toLowerCase();

  const hasExplicitMediaType =
    normalizedType !== '' &&
    normalizedType !== 'text' &&
    normalizedType !== 'media';

  const hasMediaPayload =
    normalizedType === 'media' ||
    hasExplicitMediaType ||
    isNonEmpty(input.mediaType) ||
    isNonEmpty(input.caption) ||
    isNonEmpty(input.documentName) ||
    isNonEmpty(input.mediaUrl) ||
    isNonEmpty(input.mediaBase64);

  const resolvedMediaType = input.mediaType
    ?? (hasExplicitMediaType ? rawType : null);

  if (hasMediaPayload) {
    const fallbackLabel = resolvedMediaType ? `[${resolvedMediaType}]` : '[media]';

    return {
      content: isNonEmpty(input.caption)
        ? input.caption!.trim()
        : normalizedContent || fallbackLabel,
      messageType: 'media',
      mediaType: resolvedMediaType,
      caption: isNonEmpty(input.caption) ? input.caption!.trim() : null,
      documentName: isNonEmpty(input.documentName) ? input.documentName!.trim() : null,
      mediaUrl: isNonEmpty(input.mediaUrl) ? input.mediaUrl!.trim() : null,
      mediaBase64: isNonEmpty(input.mediaBase64) ? input.mediaBase64!.trim() : null,
    };
  }

  return {
    content: normalizedContent,
    messageType: 'text',
    mediaType: null,
    caption: null,
    documentName: null,
    mediaUrl: null,
    mediaBase64: null,
  };
};

export interface UazMediaPayloadParams {
  phoneNumber: string;
  mediaType: string;
  mediaUrl: string | null;
  mediaBase64: string | null;
  caption: string | null;
  documentName: string | null;
}

export const buildUazMediaApiBody = ({
  phoneNumber,
  mediaType,
  mediaUrl,
  mediaBase64,
  caption,
  documentName,
}: UazMediaPayloadParams): Record<string, unknown> => {
  const file = mediaUrl ?? mediaBase64;
  const normalizedMediaType =
    mediaType.toLowerCase() === 'ptt' ? 'audio' : mediaType;

  if (!file) {
    throw new Error('Origem da mídia é obrigatória');
  }

  const payload: Record<string, unknown> = {
    number: phoneNumber,
    type: normalizedMediaType,
    file,
  };

  if (documentName) {
    payload.docName = documentName;
  }

  if (caption) {
    payload.caption = caption;
  }

  return payload;
};

export interface UazMediaPayloadParams {
  phoneNumber: string;
  mediaType: string;
  mediaUrl: string | null;
  mediaBase64: string | null;
  caption: string | null;
  documentName: string | null;
}

interface UazMediaApiBody {
  number: string;
  mediaType: string;
  mediaUrl?: string;
  mediaBase64?: string;
  caption?: string;
  documentName?: string;
}

export const buildUazMediaApiBody = ({
  phoneNumber,
  mediaType,
  mediaUrl,
  mediaBase64,
  caption,
  documentName,
}: UazMediaPayloadParams): UazMediaApiBody => {
  if (!mediaUrl && !mediaBase64) {
    throw new Error('Origem da mídia é obrigatória');
  }

  const payload: UazMediaApiBody = {
    number: phoneNumber,
    mediaType,
  };

  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
  } else if (mediaBase64) {
    payload.mediaBase64 = mediaBase64;
  }

  if (documentName) {
    payload.documentName = documentName;
  }

  if (caption) {
    payload.caption = caption;
  }

  return payload;
};

export interface UazMediaPayloadParams {
  phoneNumber: string;
  mediaType: string;
  mediaUrl: string | null;
  mediaBase64: string | null;
  caption: string | null;
  documentName: string | null;
}

export interface UazContactPayloadParams {
  phoneNumber: string;
  contactName: string;
  contactPhone: string;
}

export const UAZ_CONTACT_ENDPOINT = 'contact';

export const buildUazMediaApiBody = ({
  phoneNumber,
  mediaType,
  mediaUrl,
  mediaBase64,
  caption,
  documentName,
}: UazMediaPayloadParams): Record<string, unknown> => {
  const file = mediaUrl ?? mediaBase64;

  if (!file) {
    throw new Error('Origem da mídia é obrigatória');
  }

  const payload: Record<string, unknown> = {
    number: phoneNumber,
    type: mediaType,
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

export const buildUazContactApiBody = ({
  phoneNumber,
  contactName,
  contactPhone,
}: UazContactPayloadParams): Record<string, unknown> => ({
  number: phoneNumber,
  name: contactName,
  phone: contactPhone,
});

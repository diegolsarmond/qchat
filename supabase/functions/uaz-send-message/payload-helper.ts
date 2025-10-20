export interface UazMediaPayloadParams {
  phoneNumber: string;
  mediaType: string;
  mediaUrl: string | null;
  mediaBase64: string | null;
  caption: string | null;
  documentName: string | null;
}

export interface UazLocationPayloadParams {
  phoneNumber: string;
  latitude: number;
  longitude: number;
  locationName?: string | null;
}

export const UAZ_LOCATION_API_PATH = 'location';

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

export const buildUazLocationApiBody = ({
  phoneNumber,
  latitude,
  longitude,
  locationName,
}: UazLocationPayloadParams): Record<string, unknown> => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Coordenadas inválidas');
  }

  const payload: Record<string, unknown> = {
    number: phoneNumber,
    latitude,
    longitude,
  };

  const trimmedName = locationName?.trim();
  if (trimmedName) {
    payload.locationName = trimmedName;
  }

  return payload;
};

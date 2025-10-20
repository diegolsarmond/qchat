export const UAZ_MENU_ENDPOINT = 'menu';
export const UAZ_CONTACT_ENDPOINT = 'contact';
export const UAZ_LOCATION_API_PATH = 'location';

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

export interface UazLocationPayloadParams {
  phoneNumber: string;
  latitude: number;
  longitude: number;
  locationName?: string | null;
}

export interface UazInteractiveMenuRow {
  id: string;
  title: string;
  description?: string;
}

export interface UazInteractiveMenuSection {
  title?: string;
  rows: UazInteractiveMenuRow[];
}

export interface UazInteractiveMenuOptions {
  header?: string;
  body: string;
  footer?: string;
  type: 'buttons' | 'list';
  button?: string;
  buttons?: UazInteractiveMenuRow[];
  sections?: UazInteractiveMenuSection[];
}

export interface UazInteractivePayloadParams {
  phoneNumber: string;
  menu: UazInteractiveMenuOptions;
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

export const buildUazInteractiveApiBody = ({
  phoneNumber,
  menu,
}: UazInteractivePayloadParams): Record<string, unknown> => {
  const options: Record<string, unknown> = {
    body: menu.body,
    type: menu.type,
  };

  if (menu.header) {
    options.header = menu.header;
  }

  if (menu.footer) {
    options.footer = menu.footer;
  }

  if (menu.type === 'buttons' && menu.buttons?.length) {
    options.buttons = menu.buttons.map((button) => ({
      id: button.id,
      title: button.title,
    }));
  }

  if (menu.type === 'list') {
    if (menu.button) {
      options.button = menu.button;
    }

    if (menu.sections?.length) {
      options.sections = menu.sections.map((section) => ({
        ...(section.title ? { title: section.title } : {}),
        rows: section.rows.map((row) => ({
          id: row.id,
          title: row.title,
          ...(row.description ? { description: row.description } : {}),
        })),
      }));
    }
  }

  return {
    number: phoneNumber,
    options,
  };
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

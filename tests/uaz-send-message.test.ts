import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUazMediaApiBody,
  buildUazInteractiveApiBody,
  UAZ_MENU_ENDPOINT,
} from '../supabase/functions/uaz-send-message/payload-helper.ts';
  buildUazContactApiBody,
  UAZ_CONTACT_ENDPOINT,
} from '../supabase/functions/uaz-send-message/payload-helper.ts';
  buildUazLocationApiBody,
  UAZ_LOCATION_API_PATH,
} from '../supabase/functions/uaz-send-message/payload-helper.ts';
import { buildUazMediaApiBody } from '../supabase/functions/uaz-send-message/payload-helper.ts';
import { resolveMessageStorage } from '../supabase/functions/message-storage.ts';

test('buildUazMediaApiBody monta payload base64 corretamente', () => {
  const body = buildUazMediaApiBody({
    phoneNumber: '5531999999999',
    mediaType: 'image',
    mediaUrl: null,
    mediaBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    caption: 'Legenda de teste',
    documentName: 'imagem.png',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    type: 'image',
    file: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    docName: 'imagem.png',
    caption: 'Legenda de teste',
  });
});

test('buildUazInteractiveApiBody monta payload de botões', () => {
  const body = buildUazInteractiveApiBody({
    phoneNumber: '5531999999999',
    menu: {
      type: 'buttons',
      body: 'Escolha uma opção',
      header: 'Cabeçalho',
      footer: 'Rodapé',
      buttons: [
        { id: 'opt_1', title: 'Opção 1' },
        { id: 'opt_2', title: 'Opção 2' },
      ],
    },
test('buildUazContactApiBody monta payload de contato corretamente', () => {
  const body = buildUazContactApiBody({
    phoneNumber: '5531999999999',
    contactName: 'Maria Silva',
    contactPhone: '31988887777',
test('buildUazLocationApiBody monta payload de localização corretamente', () => {
  const body = buildUazLocationApiBody({
    phoneNumber: '5531999999999',
    latitude: -19.923,
    longitude: -43.938,
    locationName: 'Praça da Liberdade',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    options: {
      body: 'Escolha uma opção',
      type: 'buttons',
      header: 'Cabeçalho',
      footer: 'Rodapé',
      buttons: [
        { id: 'opt_1', title: 'Opção 1' },
        { id: 'opt_2', title: 'Opção 2' },
      ],
    },
  });
});

test('buildUazInteractiveApiBody monta payload de lista', () => {
  const body = buildUazInteractiveApiBody({
    phoneNumber: '5531999999999',
    menu: {
      type: 'list',
      body: 'Selecione um item',
      button: 'Abrir lista',
      sections: [
        {
          title: 'Sessão A',
          rows: [
            { id: 'row_a', title: 'Item A', description: 'Descrição A' },
          ],
        },
      ],
    },
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    options: {
      body: 'Selecione um item',
      type: 'list',
      button: 'Abrir lista',
      sections: [
        {
          title: 'Sessão A',
          rows: [
            { id: 'row_a', title: 'Item A', description: 'Descrição A' },
          ],
        },
      ],
    },
  });
});

test('constante do endpoint interativo utiliza /send/menu', () => {
  assert.equal(UAZ_MENU_ENDPOINT, 'menu');
    name: 'Maria Silva',
    phone: '31988887777',
  });
});

test('endpoint de contato utiliza rota contact', () => {
  assert.strictEqual(UAZ_CONTACT_ENDPOINT, 'contact');
    latitude: -19.923,
    longitude: -43.938,
    locationName: 'Praça da Liberdade',
  });
});

test('UAZ_LOCATION_API_PATH aponta para o endpoint de localização', () => {
  assert.strictEqual(UAZ_LOCATION_API_PATH, 'location');
test('buildUazMediaApiBody normaliza PTT para audio', () => {
  const body = buildUazMediaApiBody({
    phoneNumber: '5531888888888',
    mediaType: 'PTT',
    mediaUrl: 'https://example.com/audio.ptt',
    mediaBase64: null,
    caption: null,
    documentName: null,
  });

  assert.strictEqual(body.type, 'audio');
});

test('resolveMessageStorage integra MediaRecorder com type audio', () => {
  const storage = resolveMessageStorage({
    messageType: 'media',
    mediaType: 'ptt',
    mediaBase64: 'data:audio/ogg;base64,AAA',
  });

  const body = buildUazMediaApiBody({
    phoneNumber: '5531777777777',
    mediaType: storage.mediaType ?? 'ptt',
    mediaUrl: storage.mediaUrl,
    mediaBase64: storage.mediaBase64,
    caption: storage.caption,
    documentName: storage.documentName,
  });

  assert.strictEqual(body.type, 'audio');
});

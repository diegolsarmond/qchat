import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUazMediaApiBody,
  buildUazLocationApiBody,
  UAZ_LOCATION_API_PATH,
} from '../supabase/functions/uaz-send-message/payload-helper.ts';

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

test('buildUazLocationApiBody monta payload de localização corretamente', () => {
  const body = buildUazLocationApiBody({
    phoneNumber: '5531999999999',
    latitude: -19.923,
    longitude: -43.938,
    locationName: 'Praça da Liberdade',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    latitude: -19.923,
    longitude: -43.938,
    locationName: 'Praça da Liberdade',
  });
});

test('UAZ_LOCATION_API_PATH aponta para o endpoint de localização', () => {
  assert.strictEqual(UAZ_LOCATION_API_PATH, 'location');
});

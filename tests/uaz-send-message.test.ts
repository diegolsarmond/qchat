import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUazMediaApiBody,
  buildUazContactApiBody,
  UAZ_CONTACT_ENDPOINT,
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

test('buildUazContactApiBody monta payload de contato corretamente', () => {
  const body = buildUazContactApiBody({
    phoneNumber: '5531999999999',
    contactName: 'Maria Silva',
    contactPhone: '31988887777',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    name: 'Maria Silva',
    phone: '31988887777',
  });
});

test('endpoint de contato utiliza rota contact', () => {
  assert.strictEqual(UAZ_CONTACT_ENDPOINT, 'contact');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUazMediaApiBody } from '../supabase/functions/uaz-send-message/payload-helper.ts';
import { resolveMessageStorage } from '../supabase/functions/message-storage.ts';

test('buildUazMediaApiBody monta payload com mediaUrl corretamente', () => {
  const body = buildUazMediaApiBody({
    phoneNumber: '5531999999999',
    mediaType: 'image',
    mediaUrl: 'https://example.com/image.png',
    mediaBase64: null,
    caption: 'Legenda via URL',
    documentName: 'imagem-url.png',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    mediaType: 'image',
    mediaUrl: 'https://example.com/image.png',
    caption: 'Legenda via URL',
    documentName: 'imagem-url.png',
  });
});

test('buildUazMediaApiBody monta payload com mediaBase64 corretamente', () => {
  const body = buildUazMediaApiBody({
    phoneNumber: '5531999999999',
    mediaType: 'image',
    mediaUrl: null,
    mediaBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    caption: 'Legenda base64',
    documentName: 'imagem-base64.png',
  });

  assert.deepStrictEqual(body, {
    number: '5531999999999',
    mediaType: 'image',
    mediaBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    caption: 'Legenda base64',
    documentName: 'imagem-base64.png',
  });
});

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

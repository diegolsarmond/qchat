import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUazMediaApiBody,
  buildUazInteractiveApiBody,
  UAZ_MENU_ENDPOINT,
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
});

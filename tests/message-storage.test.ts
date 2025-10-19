import test from "node:test";
import assert from "node:assert/strict";
import { resolveMessageStorage } from "../supabase/functions/message-storage";

test("resolveMessageStorage mantém mensagens de texto", () => {
  const result = resolveMessageStorage({
    content: "olá",
    messageType: "text",
  });

  assert.deepEqual(result, {
    content: "olá",
    messageType: "text",
    mediaType: null,
    caption: null,
    documentName: null,
    mediaUrl: null,
    mediaBase64: null,
  });
});

test("resolveMessageStorage estrutura dados de mídia com legenda", () => {
  const result = resolveMessageStorage({
    content: "[image]",
    messageType: "media",
    mediaType: "image",
    caption: "foto",
    mediaUrl: "https://exemplo.com/imagem.png",
  });

  assert.deepEqual(result, {
    content: "foto",
    messageType: "media",
    mediaType: "image",
    caption: "foto",
    documentName: null,
    mediaUrl: "https://exemplo.com/imagem.png",
    mediaBase64: null,
  });
});

test("resolveMessageStorage normaliza tipo específico de mídia", () => {
  const result = resolveMessageStorage({
    messageType: "image",
    mediaBase64: "QkFTRTY0",
  });

  assert.equal(result.messageType, "media");
  assert.equal(result.mediaType, "image");
  assert.equal(result.content, "[image]");
  assert.equal(result.mediaBase64, "QkFTRTY0");
});

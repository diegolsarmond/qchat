import test from "node:test";
import assert from "node:assert/strict";
import { buildMediaMessagePayload } from "../src/components/ChatArea";

test("monta payload de mídia com URL", () => {
  const payload = buildMediaMessagePayload({
    mediaType: "image",
    originType: "url",
    originValue: "https://exemplo.com/imagem.png",
    caption: "foto",
  });

  assert.deepEqual(payload, {
    content: "foto",
    messageType: "media",
    mediaType: "image",
    mediaUrl: "https://exemplo.com/imagem.png",
    caption: "foto",
  });
});

test("monta payload de mídia com base64 e fallback", () => {
  const payload = buildMediaMessagePayload({
    mediaType: "document",
    originType: "base64",
    originValue: "ZGFkb3M=",
    documentName: "contrato.pdf",
  });

  assert.deepEqual(payload, {
    content: "[document]",
    messageType: "media",
    mediaType: "document",
    mediaBase64: "ZGFkb3M=",
    documentName: "contrato.pdf",
  });
});

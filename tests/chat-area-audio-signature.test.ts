import test from "node:test";
import assert from "node:assert/strict";
import { getAudioSignature, resolveAudioSource } from "../src/components/ChatArea";
import type { Message } from "../src/types/whatsapp";

test("getAudioSignature prioriza mediaUrl quando disponível", () => {
  const message: Message = {
    id: "audio-url",
    chatId: "chat-1",
    content: "",
    timestamp: "10:00",
    from: "them",
    messageType: "media",
    mediaType: "audio",
    mediaUrl: "https://example.com/audio.ogg",
  };

  assert.equal(getAudioSignature(message), "url:https://example.com/audio.ogg");
});

test("getAudioSignature gera assinatura para conteúdo base64", () => {
  const message: Message = {
    id: "audio-base64",
    chatId: "chat-1",
    content: "",
    timestamp: "10:01",
    from: "them",
    messageType: "media",
    mediaType: "ptt",
    mediaBase64: "AQID",
  };

  assert.equal(getAudioSignature(message), "base64:AQID");
});

test("resolveAudioSource usa objectURL e marca como revogável", () => {
  const originalUrl = globalThis.URL;
  let createdBlob: Blob | null = null;
  let createCalls = 0;

  const mockUrl = {
    createObjectURL: (blob: Blob) => {
      createdBlob = blob;
      createCalls += 1;
      return "blob:audio";
    },
    revokeObjectURL: () => {},
  } as unknown as typeof URL;

  (globalThis as any).URL = mockUrl;

  try {
    const message: Message = {
      id: "audio-base64-object",
      chatId: "chat-1",
      content: "",
      timestamp: "10:02",
      from: "them",
      messageType: "media",
      mediaType: "voice",
      mediaBase64: "AQID",
    };

    const source = resolveAudioSource(message);
    assert.ok(source);
    assert.equal(source?.url, "blob:audio");
    assert.equal(source?.shouldRevoke, true);
    assert.ok(createdBlob instanceof Blob);
    assert.equal(createCalls, 1);
  } finally {
    if (originalUrl === undefined) {
      delete (globalThis as any).URL;
    } else {
      (globalThis as any).URL = originalUrl;
    }
  }
});

test("resolveAudioSource retorna URL original sem revogação para mediaUrl", () => {
  const message: Message = {
    id: "audio-url-direct",
    chatId: "chat-1",
    content: "",
    timestamp: "10:03",
    from: "them",
    messageType: "media",
    mediaType: "audio",
    mediaUrl: "https://example.com/audio.ogg",
  };

  const source = resolveAudioSource(message);
  assert.ok(source);
  assert.equal(source?.url, "https://example.com/audio.ogg");
  assert.equal(source?.shouldRevoke, false);
});

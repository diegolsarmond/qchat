import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "./test-utils/testing-library-react";
import { ChatArea, buildMediaMessagePayload, requestAuthenticatedMedia } from "../src/components/ChatArea";
import type { Chat, Message } from "../src/types/whatsapp";
import { supabase } from "../src/integrations/supabase/client";

const baseChat: Chat = {
  id: "chat-1",
  name: "Contato",
  lastMessage: "",
  timestamp: "",
  unread: 0,
  isGroup: false,
  attendanceStatus: "waiting",
};

const renderWithMessages = (messages: Message[]) =>
  render(
    <ChatArea
      chat={baseChat}
      messages={messages}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      showSidebar
      onShowSidebar={() => {}}
    />,
  );

const withObjectUrl = (value: string) => {
  const target: any = (globalThis as any).URL || {};
  const originalCreate = target.createObjectURL;
  const originalRevoke = target.revokeObjectURL;
  target.createObjectURL = () => value;
  target.revokeObjectURL = () => {};
  (globalThis as any).URL = target;
  return () => {
    if (originalCreate) {
      target.createObjectURL = originalCreate;
    } else {
      delete target.createObjectURL;
    }
    if (originalRevoke) {
      target.revokeObjectURL = originalRevoke;
    } else {
      delete target.revokeObjectURL;
    }
    (globalThis as any).URL = target;
  };
};

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

test("renderiza mensagem de imagem com link de download", () => {
  const messages: Message[] = [
    {
      id: "msg-img",
      chatId: "chat-1",
      content: "[image]",
      timestamp: "10:00",
      from: "them",
      messageType: "media",
      mediaType: "image",
      mediaUrl: "https://exemplo.com/foto.png",
      caption: "Foto recente",
      documentName: "foto.png",
    },
  ];

  const { container } = renderWithMessages(messages);

  assert.match(container.markup, /<img[^>]+src="https:\/\/exemplo.com\/foto.png"/);
  assert.match(container.markup, /Baixar foto.png/);
});

test("renderiza vídeo a partir de base64", () => {
  const restore = withObjectUrl("blob:video.mp4");
  try {
    const messages: Message[] = [
      {
        id: "msg-video",
        chatId: "chat-1",
        content: "[video]",
        timestamp: "10:01",
        from: "them",
        messageType: "media",
        mediaType: "video",
        mediaBase64: "AQID",
        caption: "Vídeo de teste",
      },
    ];

    const { container } = renderWithMessages(messages);

    assert.match(container.markup, /<video[^>]+src="blob:video.mp4"/);
    assert.match(container.markup, /Vídeo de teste/);
  } finally {
    restore();
  }
});

test("renderiza documento com link de download", () => {
  const messages: Message[] = [
    {
      id: "msg-doc",
      chatId: "chat-1",
      content: "[document]",
      timestamp: "10:02",
      from: "them",
      messageType: "media",
      mediaType: "document",
      mediaUrl: "https://exemplo.com/contrato.pdf",
      documentName: "contrato.pdf",
      caption: "Confira o contrato",
    },
  ];

  const { container } = renderWithMessages(messages);

  assert.match(container.markup, /href="https:\/\/exemplo.com\/contrato.pdf"/);
  assert.match(container.markup, /Baixar contrato.pdf/);
});

test("requestAuthenticatedMedia aciona função edge", async () => {
  const functionsClient = supabase.functions as any;
  const proto = Object.getPrototypeOf(functionsClient);
  const originalInvoke = proto.invoke;
  const encoder = new TextEncoder();
  const arrayBuffer = encoder.encode("conteúdo").buffer;
  let captured: { name: string; body: any; responseType: any } | null = null;

  proto.invoke = async function (this: unknown, name: string, options: any) {
    captured = { name, body: options?.body, responseType: options?.responseType };
    return {
      data: arrayBuffer,
      error: null,
      response: {
        headers: {
          get(key: string) {
            if (key === "x-content-type") return "image/png";
            if (key === "x-file-name") return "foto.png";
            return null;
          },
        },
      },
    };
  };

  try {
    const result = await requestAuthenticatedMedia({
      credentialId: "cred-1",
      url: "https://subdominio.uazapi.com/midia",
    });

    assert.ok(result);
    assert.equal(captured?.name, "uaz-download-media");
    assert.deepEqual(captured?.body, {
      credentialId: "cred-1",
      url: "https://subdominio.uazapi.com/midia",
    });
    assert.equal((captured as any)?.responseType, "arraybuffer");
    assert.equal(result?.contentType, "image/png");
    assert.equal(result?.fileName, "foto.png");
    assert.equal(result?.blob.type, "image/png");
  } finally {
    proto.invoke = originalInvoke;
  }
});

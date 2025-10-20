import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, Message, SendMessagePayload } from "../src/types/whatsapp";

class MockFileReader {
  static mockResult = "data:image/png;base64,ZmFrZUJhc2U2NA==";
  result: string | null = null;
  onload: ((event: { target: { result: string | ArrayBuffer | null } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(_file: Blob) {
    this.result = MockFileReader.mockResult;
    if (this.result) {
      this.onload?.({ target: { result: this.result } });
      return;
    }
    this.onerror?.();
  }
}

test("selecionar imagem dispara onSendMessage com base64", async () => {
  const originalFileReader = (global as any).FileReader;
  (global as any).FileReader = MockFileReader;
  MockFileReader.mockResult = "data:image/png;base64,ZmFrZUJhc2U2NA==";

  try {
    const chat: Chat = {
      id: "chat-imagem",
      name: "Contato",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
    };

    const messages: Message[] = [];
    const calls: SendMessagePayload[] = [];

    const { getByTestId } = render(
      <ChatArea
        chat={chat}
        messages={messages}
        onSendMessage={(payload) => {
          calls.push(payload);
        }}
        onAssignChat={() => {}}
        showSidebar
        onShowSidebar={() => {}}
      />,
    );

    const file = new File(["conteudo"], "imagem.png", { type: "image/png" });
    const input = getByTestId("chat-area-file-input");

    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      assert.equal(calls.length, 1);
    });

    assert.deepEqual(calls[0], {
      content: "[image]",
      messageType: "media",
      mediaType: "image",
      mediaBase64: "ZmFrZUJhc2U2NA==",
    });
  } finally {
    (global as any).FileReader = originalFileReader;
  }
});

test("selecionar áudio dispara onSendMessage com base64", async () => {
  const originalFileReader = (global as any).FileReader;
  (global as any).FileReader = MockFileReader;
  const expectedBase64 = "QVVESU8=";
  MockFileReader.mockResult = `data:audio/ogg;base64,${expectedBase64}`;

  try {
    const chat: Chat = {
      id: "chat-audio",
      name: "Contato",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
    };

    const messages: Message[] = [];
    const calls: SendMessagePayload[] = [];

    const { getByTestId } = render(
      <ChatArea
        chat={chat}
        messages={messages}
        onSendMessage={(payload) => {
          calls.push(payload);
        }}
        onAssignChat={() => {}}
        showSidebar
        onShowSidebar={() => {}}
      />,
    );

    const file = new File(["conteudo"], "gravacao.ogg", { type: "audio/ogg" });
    const input = getByTestId("chat-area-file-input");

    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      assert.equal(calls.length, 1);
    });

    assert.deepEqual(calls[0], {
      content: "[audio]",
      messageType: "media",
      mediaType: "audio",
      mediaBase64: expectedBase64,
    });
  } finally {
    (global as any).FileReader = originalFileReader;
  }
});

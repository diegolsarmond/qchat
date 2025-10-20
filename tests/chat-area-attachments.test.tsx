import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, Message, SendMessagePayload } from "../src/types/whatsapp";

class MockFileReader {
  result: string | null = null;
  onload: ((event: { target: { result: string | ArrayBuffer | null } }) => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(_file: Blob) {
    this.result = "data:image/png;base64,ZmFrZUJhc2U2NA==";
    if (this.onload) {
      this.onload({ target: { result: this.result } });
    }
  }
}

test("selecionar imagem dispara onSendMessage com base64", async () => {
  const originalFileReader = (global as any).FileReader;
  (global as any).FileReader = MockFileReader;

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

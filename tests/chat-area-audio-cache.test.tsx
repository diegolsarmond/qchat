import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "./test-utils/testing-library-react";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, Message } from "../src/types/whatsapp";

const baseChat: Chat = {
  id: "chat-audio-cache",
  name: "Cliente",
  lastMessage: "",
  timestamp: "10:00",
  unread: 0,
  isGroup: false,
  attendanceStatus: "waiting",
};

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

test("mantém processamento de áudio após mensagem de texto", () => {
  const restore = withObjectUrl("blob:audio-cache");
  try {
    const messages: Message[] = [
      {
        id: "msg-texto",
        chatId: baseChat.id,
        content: "Olá",
        timestamp: "10:01",
        from: "them",
        messageType: "text",
      },
      {
        id: "msg-audio",
        chatId: baseChat.id,
        content: "[audio]",
        timestamp: "10:02",
        from: "them",
        messageType: "media",
        mediaType: "audio",
        mediaBase64: "AQID",
      },
    ];

    const { container } = render(
      <ChatArea
        chat={baseChat}
        messages={messages}
        onSendMessage={() => {}}
        onAssignChat={() => {}}
        showSidebar
        onShowSidebar={() => {}}
      />,
    );

    assert.match(container.markup, /<audio[^>]+src="blob:audio-cache"/);
  } finally {
    restore();
  }
});

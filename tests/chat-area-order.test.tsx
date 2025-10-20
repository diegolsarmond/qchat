import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, Message } from "../src/types/whatsapp";

test("ChatArea exibe mensagens mais recentes primeiro", () => {
  const chat: Chat = {
    id: "chat-ordem",
    name: "Cliente",
    lastMessage: "",
    timestamp: "10:00",
    unread: 0,
    isGroup: false,
  };

  const messages: Message[] = [
    {
      id: "antiga",
      chatId: "chat-ordem",
      content: "Mensagem antiga",
      timestamp: "09:00",
      from: "them",
      status: "delivered",
    },
    {
      id: "recente",
      chatId: "chat-ordem",
      content: "Mensagem recente",
      timestamp: "10:00",
      from: "me",
      status: "sent",
    },
  ];

  const html = renderToStaticMarkup(
    <ChatArea
      chat={chat}
      messages={messages}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      onLoadMoreMessages={() => {}}
      hasMoreMessages={false}
      isLoadingMoreMessages={false}
      isPrependingMessages={false}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  const indexRecente = html.indexOf("Mensagem recente");
  const indexAntiga = html.indexOf("Mensagem antiga");

  assert.ok(indexRecente >= 0 && indexAntiga >= 0);
  assert.ok(indexRecente < indexAntiga);
});

import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, Message } from "../src/types/whatsapp";

test("ChatArea exibe mensagens em ordem cronológica com botão no topo", () => {
  const chat: Chat = {
    id: "chat-ordem",
    name: "Cliente",
    lastMessage: "",
    timestamp: "10:00",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
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
      hasMoreMessages
      isLoadingMoreMessages={false}
      isPrependingMessages={false}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  const indexBotao = html.indexOf("Carregar mensagens anteriores");
  const indexRecente = html.indexOf("Mensagem recente");
  const indexAntiga = html.indexOf("Mensagem antiga");

  assert.ok(indexBotao >= 0 && indexAntiga >= 0 && indexRecente >= 0);
  assert.ok(indexBotao < indexAntiga);
  assert.ok(indexAntiga < indexRecente);
});

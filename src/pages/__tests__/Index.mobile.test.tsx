import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ChatSidebar } from "../../components/ChatSidebar";
import { ChatArea } from "../../components/ChatArea";
import type { Chat, Message, SendMessagePayload } from "../../types/whatsapp";

const baseChat: Chat = {
  id: "chat-1",
  name: "Cliente 1",
  lastMessage: "Olá",
  timestamp: "10:00",
  unread: 0,
  avatar: undefined,
  isGroup: false,
  assignedTo: undefined,
};

const baseMessages: Message[] = [
  {
    id: "msg-1",
    chatId: "chat-1",
    content: "Mensagem",
    timestamp: "10:00",
    from: "me",
    status: "sent",
  },
];

const extractClassName = (html: string, testId: string) => {
  const regex = new RegExp(`data-testid="${testId}"[^>]*class="([^"]*)"`, "i");
  const match = html.match(regex);
  if (!match) {
    throw new Error(`Elemento com data-testid "${testId}" não encontrado.`);
  }
  return match[1];
};

const renderComponent = (element: React.ReactElement) =>
  renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

const noop = (_payload?: SendMessagePayload) => {};

const createSidebar = (showSidebar: boolean) => (
  <ChatSidebar
    chats={[baseChat]}
    selectedChat={baseChat}
    onSelectChat={noop}
    onAssignChat={noop}
    showSidebar={showSidebar}
    onToggleSidebar={noop}
  />
);

const createChatArea = (showSidebar: boolean) => (
  <ChatArea
    chat={baseChat}
    messages={baseMessages}
    onSendMessage={noop}
    onAssignChat={noop}
    onLoadMoreMessages={noop}
    hasMoreMessages={false}
    isLoadingMoreMessages={false}
    isPrependingMessages={false}
    showSidebar={showSidebar}
    onShowSidebar={noop}
  />
);

test("mantém apenas a lista visível quando showSidebar é verdadeiro no mobile", () => {
  const sidebarHtml = renderComponent(createSidebar(true));
  const chatHtml = renderComponent(createChatArea(true));

  const sidebarClass = extractClassName(sidebarHtml, "chat-sidebar");
  const chatClass = extractClassName(chatHtml, "chat-area");

  assert.ok(sidebarClass.includes("flex"));
  assert.ok(!sidebarClass.includes("hidden md:flex"));
  assert.ok(chatClass.includes("hidden md:flex"));
});

test("mantém apenas o chat visível quando showSidebar é falso no mobile", () => {
  const sidebarHtml = renderComponent(createSidebar(false));
  const chatHtml = renderComponent(createChatArea(false));

  const sidebarClass = extractClassName(sidebarHtml, "chat-sidebar");
  const chatClass = extractClassName(chatHtml, "chat-area");

  assert.ok(sidebarClass.includes("hidden md:flex"));
  assert.ok(chatClass.includes("flex"));
  assert.ok(!chatClass.includes("hidden md:flex"));
});

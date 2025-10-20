import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat } from "../src/types/whatsapp";

test("botão de contato exibe formulário ao ser ativado", async () => {
  const chat: Chat = {
    id: "chat-contato",
    name: "Cliente",
    lastMessage: "",
    timestamp: "",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
  };

  const { getByLabelText, queryByPlaceholderText } = render(
    <ChatArea
      chat={chat}
      messages={[]}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      showSidebar
      onShowSidebar={() => {}}
    />,
  );

  assert.equal(queryByPlaceholderText("Nome do contato"), null);

  const toggle = getByLabelText("Abrir formulário de contato");
  await fireEvent.click(toggle);

  assert.equal(getByLabelText("Fechar formulário de contato").getAttribute("aria-pressed"), "true");
  assert.ok(queryByPlaceholderText("Nome do contato"));
  assert.ok(queryByPlaceholderText("Telefone"));
});

import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ChatArea } from "../src/components/ChatArea";
import type { Chat, SendMessagePayload } from "../src/types/whatsapp";

test("botão de modo privado alterna estado com feedback", async () => {
  const chat: Chat = {
    id: "chat-privado",
    name: "Contato",
    lastMessage: "",
    timestamp: "",
    unread: 0,
    isGroup: false,
  };

  const { getByTestId } = render(
    <ChatArea
      chat={chat}
      messages={[]}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  const toggle = getByTestId("chat-area-private-toggle");
  assert.equal(toggle.props["aria-pressed"], false);
  await fireEvent.click(toggle);
  assert.equal(toggle.props["aria-pressed"], true);
  assert.ok(String(toggle.props.className || "").includes("bg-primary"));
});

test("mensagem enviada com modo privado inclui flag", async () => {
  const chat: Chat = {
    id: "chat-privado",
    name: "Contato",
    lastMessage: "",
    timestamp: "",
    unread: 0,
    isGroup: false,
  };

  const calls: SendMessagePayload[] = [];

  const { getByTestId, getByLabelText } = render(
    <ChatArea
      chat={chat}
      messages={[]}
      onSendMessage={(payload) => {
        calls.push(payload);
      }}
      onAssignChat={() => {}}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  const input = getByTestId("chat-area-input");
  await fireEvent.change(input, { target: { value: "Mensagem privada" } });
  const toggle = getByTestId("chat-area-private-toggle");
  await fireEvent.click(toggle);

  const sendButton = getByLabelText("Enviar mensagem");
  await fireEvent.click(sendButton);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].isPrivate, true);
  assert.equal(calls[0].content, "Mensagem privada");
});

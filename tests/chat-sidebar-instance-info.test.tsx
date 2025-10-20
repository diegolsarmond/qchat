import test from "node:test";
import assert from "node:assert/strict";
import { loadChatSidebar, elementContainsText } from "./chat-sidebar.test";

test("ChatSidebar exibe nome e número da instância ativos", () => {
  const { ChatSidebar } = loadChatSidebar();

  const element = ChatSidebar({
    chats: [],
    selectedChat: null,
    onSelectChat: () => {},
    onAssignChat: () => {},
    showSidebar: true,
    onToggleSidebar: () => {},
    activeFilter: "all",
    onFilterChange: () => {},
    currentUserId: "user-1",
    profileName: "Conta Principal",
    phoneNumber: "+55 11 99999-8888",
  });

  assert.ok(
    elementContainsText(element, "Conta Principal"),
    "Nome do perfil não foi exibido"
  );

  assert.ok(
    elementContainsText(element, "+55 11 99999-8888"),
    "Número de telefone não foi exibido"
  );
});

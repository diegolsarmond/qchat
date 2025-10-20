import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactNode, type ReactElement } from "react";
import type { Chat } from "@/types/whatsapp";

const findByTestId = (node: ReactNode, testId: string): ReactElement | null => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findByTestId(child, testId);
      if (result) {
        return result;
      }
    }
    return null;
  }

  if (isValidElement(node)) {
    if (node.props && node.props["data-testid"] === testId) {
      return node as ReactElement;
    }

    const { children } = node.props ?? {};
    if (children) {
      return findByTestId(children as ReactNode, testId);
    }
  }

  return null;
};

test("botão de admin dispara navegação para /admin", () => {
  const navigateFn = mock.fn();
  (globalThis as Record<string, unknown>).__CHAT_SIDEBAR_NAVIGATE__ = { fn: navigateFn };

  try {
    const chats: Chat[] = [
      {
        id: "1",
        name: "Cliente",
        lastMessage: "Olá",
        timestamp: "10:00",
        unread: 0,
        isGroup: false,
        attendanceStatus: "waiting",
      },
    ];

    const { ChatSidebar } = require("@/components/ChatSidebar") as typeof import("@/components/ChatSidebar");

    const element = ChatSidebar({
      chats,
      selectedChat: null,
      onSelectChat: () => undefined,
      onAssignChat: () => undefined,
      showSidebar: true,
      onToggleSidebar: () => undefined,
      activeFilter: "all",
      onFilterChange: () => undefined,
      currentUserId: "user-admin",
    });

    const adminButton = findByTestId(element, "admin-nav-button");
    assert.ok(adminButton);

    const onClick = adminButton.props?.onClick as ((event?: unknown) => void) | undefined;
    assert.equal(typeof onClick, "function");

    onClick?.({});

    assert.equal(navigateFn.mock.callCount(), 1);
    const [target] = navigateFn.mock.calls[0].arguments;
    assert.equal(target, "/admin");
  } finally {
    delete (globalThis as Record<string, unknown>).__CHAT_SIDEBAR_NAVIGATE__;
  }
});

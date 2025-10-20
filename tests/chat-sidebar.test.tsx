import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

type ChatSidebarModule = {
  ChatSidebar: (props: any) => any;
};

let navigateHandler: (path: string) => void = () => {};
let signOutHandler: () => Promise<void> = async () => {};

const loadChatSidebar = () => {
  const modulePath = fileURLToPath(new URL("../src/components/ChatSidebar.tsx", import.meta.url));
  const source = readFileSync(modulePath, "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: modulePath,
  });

  const module = { exports: {} as ChatSidebarModule };
  const requireFn = createRequire(modulePath);
  const React = requireFn("react");

  const stubElement = (tag: string) => (props: Record<string, unknown> = {}) =>
    React.createElement(tag, props, props.children);
  const iconStub = () => React.createElement("svg", {});

  const customRequire = (specifier: string) => {
    if (specifier === "react") {
      return React;
    }
    if (specifier === "react/jsx-runtime") {
      return requireFn(specifier);
    }
    if (specifier === "react-router-dom") {
      return { useNavigate: () => navigateHandler };
    }
    if (specifier === "lucide-react") {
      return {
        Search: iconStub,
        MessageSquare: iconStub,
        MoreVertical: iconStub,
        Users: iconStub,
        Filter: iconStub,
      };
    }
    if (specifier === "@/components/ui/input") {
      return { Input: stubElement("input") };
    }
    if (specifier === "@/components/ui/avatar") {
      const component = stubElement("div");
      return {
        Avatar: component,
        AvatarFallback: component,
        AvatarImage: component,
      };
    }
    if (specifier === "@/components/ui/button") {
      return { Button: stubElement("button") };
    }
    if (specifier === "@/components/ui/badge") {
      return { Badge: stubElement("span") };
    }
    if (specifier === "@/components/ui/scroll-area") {
      return { ScrollArea: stubElement("div") };
    }
    if (specifier === "@/components/ui/tabs") {
      return {
        Tabs: stubElement("div"),
        TabsList: stubElement("div"),
        TabsTrigger: stubElement("button"),
      };
    }
    if (specifier === "@/integrations/supabase/client") {
      return {
        supabase: {
          auth: {
            signOut: () => signOutHandler(),
          },
        },
      };
    }
    return requireFn(specifier);
  };

  const context = vm.createContext({ module, exports: module.exports, require: customRequire, console });
  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return module.exports.ChatSidebar;
};

const collectChildren = (node: any) => {
  if (!node || typeof node !== "object") return [] as any[];
  const { children } = node.props ?? {};
  if (!children) return [] as any[];
  return Array.isArray(children) ? children : [children];
};

const elementContainsText = (node: any, text: string): boolean => {
  if (typeof node === "string") {
    return node.toString().includes(text);
  }
  for (const child of collectChildren(node)) {
    if (elementContainsText(child, text)) {
      return true;
    }
  }
  return false;
};

const findElementWithOnClickAndText = (node: any, text: string): any => {
  if (!node || typeof node !== "object") return null;
  if (typeof node.props?.onClick === "function" && elementContainsText(node, text)) {
    return node;
  }
  for (const child of collectChildren(node)) {
    const found = findElementWithOnClickAndText(child, text);
    if (found) return found;
  }
  return null;
};

test("ChatSidebar aciona onToggleSidebar ao selecionar um chat", () => {
  const ChatSidebar = loadChatSidebar();
  const calls: string[] = [];
  const chat = {
    id: "1",
    name: "Contato",
    lastMessage: "Olá",
    timestamp: "10:00",
    unread: 0,
  };

  const element = ChatSidebar({
    chats: [chat],
    selectedChat: null,
    onSelectChat: () => {
      calls.push("select");
    },
    onAssignChat: () => {},
    showSidebar: true,
    onToggleSidebar: () => {
      calls.push("toggle");
    },
  });

  const clickable = findElementWithOnClickAndText(element, chat.name);
  assert.ok(clickable, "Elemento clicável não encontrado");

  clickable.props.onClick();

  assert.deepEqual(calls, ["toggle", "select"], "Eventos não ocorreram na ordem esperada");
});

test("ChatSidebar chama signOut e redireciona ao clicar em Sair", async () => {
  const signOutCalls: number[] = [];
  const navigateCalls: string[] = [];
  signOutHandler = async () => {
    signOutCalls.push(1);
  };
  navigateHandler = (path: string) => {
    navigateCalls.push(path);
  };

  const ChatSidebar = loadChatSidebar();

  const element = ChatSidebar({
    chats: [],
    selectedChat: null,
    onSelectChat: () => {},
    onAssignChat: () => {},
    showSidebar: true,
    onToggleSidebar: () => {},
  });

  assert.ok(elementContainsText(element, "Sair"), "Texto 'Sair' não foi renderizado");

  const signOutButton = findElementWithOnClickAndText(element, "Sair");
  assert.ok(signOutButton, "Botão de sair não encontrado");

  await signOutButton.props.onClick();

  assert.equal(signOutCalls.length, 1, "signOut não foi chamado");
  assert.deepEqual(navigateCalls, ["/login"], "Redirecionamento inesperado");

  signOutHandler = async () => {};
  navigateHandler = () => {};
});

test("ChatSidebar exibe o nome do responsável quando o chat está atribuído", () => {
  const ChatSidebar = loadChatSidebar();
  const element = ChatSidebar({
    chats: [
      {
        id: "1",
        name: "Contato",
        lastMessage: "Olá",
        timestamp: "10:00",
        unread: 0,
        isGroup: false,
        assignedTo: "user-1",
        assignedUserNames: ["Maria"],
      },
    ],
    selectedChat: null,
    onSelectChat: () => {},
    onAssignChat: () => {},
    showSidebar: true,
    onToggleSidebar: () => {},
  });

  assert.ok(
    elementContainsText(element, "Maria"),
    "Nome do responsável não foi renderizado"
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

type ChatSidebarModule = {
  ChatSidebar: (props: any) => any;
  filterChatsByAttendance: (chats: any[], filter: string, currentUserId?: string) => any[];
};

let navigateHandler: (path: string) => void = () => {};
let signOutHandler: () => Promise<void> = async () => {};

export const loadChatSidebar = () => {
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

  return module.exports as ChatSidebarModule;
};

const collectChildren = (node: any) => {
  if (!node || typeof node !== "object") return [] as any[];
  const { children } = node.props ?? {};
  if (!children) return [] as any[];
  return Array.isArray(children) ? children : [children];
};

export const elementContainsText = (node: any, text: string): boolean => {
  if (Array.isArray(node)) {
    return node.some(child => elementContainsText(child, text));
  }
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
  const { ChatSidebar } = loadChatSidebar();
  const calls: string[] = [];
  const chat = {
    id: "1",
    name: "Contato",
    lastMessage: "Olá",
    timestamp: "10:00",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
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
    activeFilter: "all",
    onFilterChange: () => {},
    currentUserId: "user-1",
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

test("ChatSidebar exibe rótulos de atribuição quando disponíveis", () => {
  const { ChatSidebar } = loadChatSidebar();

  const chat = {
    id: "1",
    name: "Cliente Importante",
    lastMessage: "Precisamos falar",
    timestamp: "11:30",
    unread: 2,
    isGroup: false,
    attendanceStatus: "in_service",
    assignedUserNames: ["Ana", "Carlos"],
  };

  const element = ChatSidebar({
    chats: [chat],
    selectedChat: null,
    onSelectChat: () => {},
    onAssignChat: () => {},
    showSidebar: true,
    onToggleSidebar: () => {},
    activeFilter: "all",
    onFilterChange: () => {},
    currentUserId: "agent-123",
  });

  assert.ok(elementContainsText(element, "Atribuído:"), "Legenda de atribuição não foi renderizada");
  assert.ok(elementContainsText(element, "Ana"), "Nome do primeiro agente não foi exibido");
  assert.ok(elementContainsText(element, "Carlos"), "Nome do segundo agente não foi exibido");
});

test("filterChatsByAttendance filtra conversas pelo status", () => {
  const { filterChatsByAttendance } = loadChatSidebar();
  const chats = [
    {
      id: "1",
      name: "Meu atendimento",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
      assignedTo: "agent-1",
      attendanceStatus: "in_service",
    },
    {
      id: "2",
      name: "Outro atendimento",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
      assignedTo: "agent-2",
      attendanceStatus: "in_service",
    },
    {
      id: "3",
      name: "Aguardando",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
      assignedTo: undefined,
      attendanceStatus: "waiting",
    },
    {
      id: "4",
      name: "Finalizada",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
      assignedTo: "agent-3",
      attendanceStatus: "finished",
    },
  ];

  const mine = filterChatsByAttendance(chats, "mine", "agent-1").map(chat => chat.id);
  const inService = filterChatsByAttendance(chats, "in_service", "agent-1").map(chat => chat.id);
  const waiting = filterChatsByAttendance(chats, "waiting", "agent-1").map(chat => chat.id);
  const finished = filterChatsByAttendance(chats, "finished", "agent-1").map(chat => chat.id);
  const all = filterChatsByAttendance(chats, "all", "agent-1").map(chat => chat.id);

  assert.deepEqual(mine, ["1"]);
  assert.deepEqual(inService.sort(), ["1", "2"].sort());
  assert.deepEqual(waiting, ["3"]);
  assert.deepEqual(finished, ["4"]);
  assert.deepEqual(all.sort(), ["1", "2", "3", "4"].sort());
});

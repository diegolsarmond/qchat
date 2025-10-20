import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

type ReactStub = {
  useState: (initial: any) => [any, (value: any) => void];
  useEffect: () => void;
  useMemo: (factory: () => any) => any;
  __render: (component: any, props: any) => any;
  __getState: () => any[];
};

type StubComponent = {
  (props: any): any;
  lastProps?: any;
  callCount: number;
};

const createReactStub = (): ReactStub => {
  const state: any[] = [];
  let hookIndex = 0;

  const getInitialValue = (value: any) => (typeof value === "function" ? value() : value);

  const react: any = {
    useState(initial: any) {
      const index = hookIndex++;
      if (state.length <= index) {
        state.push(getInitialValue(initial));
      }
      const setState = (value: any) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      };
      return [state[index], setState];
    },
    useEffect() {},
    useMemo(factory: () => any) {
      return factory();
    },
  };

  react.__render = (Component: any, props: any) => {
    hookIndex = 0;
    return Component(props);
  };

  react.__getState = () => state;

  return react as ReactStub;
};

const createStubComponent = (type: string) => {
  const component: StubComponent = ((props: any) => {
    component.lastProps = props;
    component.callCount += 1;
    return { type, props };
  }) as StubComponent;
  component.callCount = 0;
  return component;
};

const loadIndexPage = (reactStub: ReactStub, overrides: any = {}) => {
  const modulePath = fileURLToPath(new URL("../src/pages/Index.tsx", import.meta.url));
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

  const module: any = { exports: {} };
  const requireFn = createRequire(modulePath);

  const credentialSetup = overrides.credentialSetup ?? createStubComponent("CredentialSetup");
  const qrCodeScanner = overrides.qrCodeScanner ?? createStubComponent("QRCodeScanner");
  const chatSidebar = overrides.chatSidebar ?? createStubComponent("ChatSidebar");
  const chatArea = overrides.chatArea ?? createStubComponent("ChatArea");
  const assignChatDialog = overrides.assignChatDialog ?? createStubComponent("AssignChatDialog");
  const toast = overrides.toast ?? (() => {});
  const supabaseStub = overrides.supabase ?? {
    functions: {
      invoke: async () => ({ data: {}, error: null }),
    },
    from: () => ({
      select: async () => ({ data: [], error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel() {},
  };

  const customRequire = (specifier: string) => {
    if (specifier === "react") {
      return reactStub;
    }
    if (specifier === "react/jsx-runtime") {
      return requireFn(specifier);
    }
    if (specifier === "@/components/CredentialSetup") {
      return { CredentialSetup: credentialSetup };
    }
    if (specifier === "@/components/QRCodeScanner") {
      return { QRCodeScanner: qrCodeScanner };
    }
    if (specifier === "@/components/ChatSidebar") {
      return { ChatSidebar: chatSidebar };
    }
    if (specifier === "@/components/ChatArea") {
      return { ChatArea: chatArea };
    }
    if (specifier === "@/components/AssignChatDialog") {
      return { AssignChatDialog: assignChatDialog };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast }) };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: supabaseStub };
    }
    if (specifier === "@/lib/message-order") {
      return {
        mergeFetchedMessages: (previous: any[], fetched: any[], reset: boolean) =>
          reset ? [...fetched] : [...previous, ...fetched],
      };
    }
    if (specifier === "@/lib/message-pagination") {
      return {
        createInitialMessagePagination: (limit: number) => ({ limit, offset: 0, hasMore: false }),
        applyMessagePaginationUpdate: (prev: any, received: number, options: any) => ({
          limit: options.limit ?? prev.limit,
          offset: options.reset ? Math.max(0, received) : prev.offset + Math.max(0, received),
          hasMore: options.hasMore,
        }),
      };
    }
    return requireFn(specifier);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    window: global.window,
    localStorage: global.localStorage,
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return {
    module: module.exports,
    stubs: { credentialSetup, qrCodeScanner, chatSidebar, chatArea, assignChatDialog },
    supabaseStub,
  };
};

const toArray = (value: any) => {
  if (value === undefined || value === null) {
    return [] as any[];
  }
  return Array.isArray(value) ? value : [value];
};

const findElement = (node: any, predicate: (element: any) => boolean): any => {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  for (const child of toArray(node.props?.children)) {
    const found = findElement(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
};

const findElementByType = (node: any, type: any) => findElement(node, (element) => element?.type === type);

test("ao desconectar, a função edge é chamada e o fluxo retorna ao QR Code", async () => {
  const storage = (() => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => {
        map.set(key, String(value));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
    };
  })();

  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  global.window = { localStorage: storage, innerWidth: 1024 } as any;
  global.localStorage = storage as any;

  storage.setItem("activeCredentialId", "cred-test");

  try {
    const reactStub = createReactStub();
    const invokeCalls: any[] = [];
    const toastCalls: any[] = [];

    const supabase = {
      functions: {
        invoke: async (name: string, payload: any) => {
          invokeCalls.push([name, payload]);
          if (name === "uaz-disconnect-instance") {
            return { data: { success: true }, error: null };
          }
          if (name === "uaz-fetch-messages") {
            return { data: { messages: [], nextOffset: 0, hasMore: false }, error: null };
          }
          if (name === "uaz-fetch-chats") {
            return { data: { chats: [] }, error: null };
          }
          return { data: {}, error: null };
        },
      },
      from: (table: string) => ({
        select: async () => ({ data: table === "users" ? [] : [], error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ data: null, error: null }),
      }),
      channel: () => ({
        on() {
          return this;
        },
        subscribe() {
          return this;
        },
      }),
      removeChannel() {},
    };

    const { module, stubs } = loadIndexPage(reactStub, {
      supabase,
      toast: (args: any) => {
        toastCalls.push(args);
      },
    });

    const user = { id: "user-1" };

    const firstRender = reactStub.__render(module.default, { user });

    const qrRender = firstRender.type === stubs.credentialSetup
      ? (() => {
          stubs.credentialSetup.lastProps.onSetupComplete("cred-test");
          return reactStub.__render(module.default, { user });
        })()
      : firstRender;

    assert.equal(qrRender.type, stubs.qrCodeScanner, "QRCodeScanner deveria ser exibido após definir a credencial");
    assert.ok(storage.getItem("activeCredentialId"));

    qrRender.props.onConnected();
    const connectedRender = reactStub.__render(module.default, { user });

    const sidebarElement = findElementByType(connectedRender, stubs.chatSidebar);
    assert.ok(sidebarElement, "ChatSidebar deveria ser renderizado após conexão");
    sidebarElement.type(sidebarElement.props);

    const sampleChat = {
      id: "chat-1",
      name: "Cliente",
      lastMessage: "Olá",
      timestamp: "10:00",
      unread: 0,
      isGroup: false,
      attendanceStatus: "waiting",
    };

    await sidebarElement.props.onSelectChat(sampleChat);
    sidebarElement.props.onAssignChat(sampleChat.id);

    const stateBeforeDisconnect = reactStub.__getState();
    assert.equal(stateBeforeDisconnect[6], true, "assignDialogOpen deveria estar verdadeiro antes da desconexão");
    assert.equal(stateBeforeDisconnect[2]?.id, sampleChat.id, "selectedChat deveria estar definido");

    await sidebarElement.props.onDisconnect();

    assert.ok(
      invokeCalls.some(([name]) => name === "uaz-disconnect-instance"),
      "Função edge de desconexão não foi chamada",
    );

    assert.equal(storage.getItem("activeCredentialId"), null, "Credencial ativa deveria ser removida do localStorage");

    const afterDisconnect = reactStub.__render(module.default, { user });

    assert.equal(afterDisconnect.type, stubs.qrCodeScanner, "Fluxo deveria retornar ao QRCodeScanner após desconexão");

    const stateAfterDisconnect = reactStub.__getState();
    assert.equal(stateAfterDisconnect[1], false, "isConnected deveria ser falso");
    assert.equal(stateAfterDisconnect[2], null, "selectedChat deveria ser limpo");
    assert.ok(Array.isArray(stateAfterDisconnect[3]), "Estado de chats deveria ser um array");
    assert.equal(stateAfterDisconnect[3].length, 0, "chats deveriam ser limpos");
    assert.ok(Array.isArray(stateAfterDisconnect[4]), "Estado de mensagens deveria ser um array");
    assert.equal(stateAfterDisconnect[4].length, 0, "messages deveriam ser limpas");
    assert.equal(stateAfterDisconnect[6], false, "assignDialogOpen deveria ser falso");
    assert.equal(stateAfterDisconnect[7], null, "chatToAssign deveria ser limpo");
    assert.equal(stateAfterDisconnect[14], false, "isDisconnecting deveria retornar a falso");

    assert.ok(
      toastCalls.some((call) => call?.title === "Desconectado"),
      "Toast de sucesso não foi emitido",
    );
  } finally {
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});

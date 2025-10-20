import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
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

  return react;
};

const createStubComponent = (type: string) => {
  const component: any = (props: any) => {
    component.lastProps = props;
    component.callCount = (component.callCount || 0) + 1;
    return { type, props };
  };
  component.callCount = 0;
  return component;
};

const loadIndexPage = (reactStub: any, overrides: any = {}) => {
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

  return { module: module.exports, stubs: { credentialSetup, qrCodeScanner, chatSidebar, chatArea } };
};

test("mensagens privadas registram apenas no banco", () => {
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

  storage.setItem("activeCredentialId", "cred-privado");

  try {
    const reactStub = createReactStub();
    const insertCalls: any[] = [];
    const invokeCalls: any[] = [];

    const supabaseStub = {
      functions: {
        invoke: async (...args: any[]) => {
          invokeCalls.push(args);
          return { data: { messageId: "remote" }, error: null };
        },
      },
      from: (table: string) => {
        if (table === "messages") {
          return {
            insert: async (payload: any) => {
              insertCalls.push(payload);
              return { data: null, error: null };
            },
          };
        }
        if (table === "chats") {
          return {
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        return {
          select: async () => ({ data: [], error: null }),
        };
      },
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

    const chatSidebar = createStubComponent("ChatSidebar");
    const chatArea = createStubComponent("ChatArea");

    const { module, stubs } = loadIndexPage(reactStub, {
      chatSidebar,
      chatArea,
      supabase: supabaseStub,
      toast: () => {},
    });

    const Index = module.default ?? module;

    const firstRender = reactStub.__render(Index, { user: { id: "user" } });
    assert.equal(firstRender.type, stubs.qrCodeScanner);

    stubs.qrCodeScanner.lastProps.onConnected();
    reactStub.__render(Index, { user: { id: "user" } });

    stubs.chatSidebar.lastProps.onSelectChat({
      id: "chat-1",
      name: "Cliente",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      isGroup: false,
    });

    reactStub.__render(Index, { user: { id: "user" } });

    const payload = {
      content: "Mensagem privada",
      messageType: "text" as const,
      isPrivate: true,
    };

    stubs.chatArea.lastProps.onSendMessage(payload);

    assert.equal(invokeCalls.length, 0);
    assert.equal(insertCalls.length, 1);
    assert.equal(insertCalls[0].content, "Mensagem privada");
    assert.equal(insertCalls[0].is_private, true);
  } finally {
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});

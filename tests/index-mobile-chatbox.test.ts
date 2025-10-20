import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
  const state: unknown[] = [];
  let hookIndex = 0;
  const effects: Array<() => void> = [];

  const getInitialValue = (value: unknown) => (typeof value === "function" ? (value as () => unknown)() : value);

  const react = {
    useState(initial: unknown) {
      const index = hookIndex++;
      if (state.length <= index) {
        state.push(getInitialValue(initial));
      }
      const setState = (value: unknown) => {
        state[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(state[index]) : value;
      };
      return [state[index], setState] as const;
    },
    useEffect(effect: () => void) {
      effects.push(effect);
    },
    useMemo<T>(factory: () => T) {
      return factory();
    },
  } as const;

  const render = <P,>(Component: (props: P) => unknown, props: P) => {
    hookIndex = 0;
    const result = Component(props);
    while (effects.length > 0) {
      const effect = effects.shift();
      effect?.();
    }
    return result;
  };

  return {
    ...react,
    __render: render,
    __getState: () => state,
  };
};

const createStubComponent = (type: string) => {
  const component = (props: unknown) => {
    component.lastProps = props;
    component.callCount = (component.callCount ?? 0) + 1;
    return { type, props };
  };
  component.callCount = 0;
  return component;
};

const loadIndexPage = (reactStub: ReturnType<typeof createReactStub>, overrides: Record<string, unknown> = {}) => {
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

  const module = { exports: {} as unknown };
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
      select: () => Promise.resolve({ data: [], error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
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
        mergeFetchedMessages: (previous: unknown[], fetched: unknown[], reset?: boolean) =>
          reset ? [...fetched] : [...previous, ...fetched],
      };
    }
    if (specifier === "@/lib/message-pagination") {
      return {
        createInitialMessagePagination: (limit: number) => ({ limit, offset: 0, hasMore: false }),
        applyMessagePaginationUpdate: (
          prev: { limit: number; offset: number; hasMore: boolean },
          receivedCount: number,
          options: { limit?: number; reset?: boolean; hasMore: boolean },
        ) => ({
          limit: options.limit ?? prev.limit,
          offset: options.reset ? Math.max(0, receivedCount) : prev.offset + Math.max(0, receivedCount),
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

  return { module: module.exports as { default: (props: unknown) => unknown } };
};

test("Index mantém a conversa visível no mobile após restaurar seleção", () => {
  const storage = (() => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => {
        map.set(key, value);
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

  global.window = { localStorage: storage, innerWidth: 360 } as unknown as Window & typeof globalThis;
  global.localStorage = storage as unknown as Storage;

  try {
    const reactStub = createReactStub();
    const chatSidebar = createStubComponent("ChatSidebar");
    const chatArea = createStubComponent("ChatArea");

    const { module } = loadIndexPage(reactStub, { chatSidebar, chatArea });
    const Index = module.default ?? (module as unknown as (props: unknown) => unknown);

    reactStub.__render(Index, { user: { id: "user-1" } });

    const state = reactStub.__getState();
    state[2] = {
      id: "chat-1",
      name: "Cliente",
      avatar: "",
      lastMessage: "",
      timestamp: "",
      unread: 0,
      assignedTo: null,
      attendanceStatus: "waiting",
    };
    state[9] = true;

    reactStub.__render(Index, { user: { id: "user-1" } });
    assert.equal(reactStub.__getState()[9], false);
  } finally {
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  }
});

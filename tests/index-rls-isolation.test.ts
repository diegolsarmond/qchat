import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
  const state: any[] = [];
  const memo: { value: any; deps?: any[] }[] = [];
  const effectDeps: any[][] = [];
  const pendingEffects: (() => void | (() => void))[] = [];
  let stateIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;

  const getInitialValue = (value: any) => (typeof value === "function" ? value() : value);

  const runEffects = () => {
    while (pendingEffects.length > 0) {
      const effect = pendingEffects.shift();
      if (effect) {
        effect();
      }
    }
  };

  const react: any = {
    useState(initial: any) {
      const index = stateIndex++;
      if (state.length <= index) {
        state.push(getInitialValue(initial));
      }
      const setState = (value: any) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      };
      return [state[index], setState];
    },
    useEffect(callback: () => void | (() => void), deps?: any[]) {
      const index = effectIndex++;
      const previous = effectDeps[index];
      let shouldRun = false;
      if (!deps) {
        shouldRun = true;
      } else if (!previous) {
        shouldRun = true;
      } else if (deps.length !== previous.length) {
        shouldRun = true;
      } else if (deps.some((value, i) => value !== previous[i])) {
        shouldRun = true;
      }
      effectDeps[index] = deps ?? [];
      if (shouldRun) {
        pendingEffects.push(callback);
      }
    },
    useMemo(factory: () => any, deps?: any[]) {
      const index = memoIndex++;
      const cached = memo[index];
      if (!deps) {
        const value = factory();
        memo[index] = { value };
        return value;
      }
      if (!cached || !cached.deps || deps.length !== cached.deps.length || deps.some((value, i) => value !== cached.deps![i])) {
        const value = factory();
        memo[index] = { value, deps };
        return value;
      }
      return cached.value;
    },
  };

  react.__render = (Component: any, props: any) => {
    stateIndex = 0;
    memoIndex = 0;
    effectIndex = 0;
    const result = Component(props);
    runEffects();
    return result;
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

const createStorage = () => {
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
    auth: { getUser: async () => ({ data: { user: { id: "default" } }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
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
    window: global.window,
    localStorage: global.localStorage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return {
    module: module.exports,
    stubs: { credentialSetup, qrCodeScanner, chatSidebar, chatArea, assignChatDialog },
  };
};

const createSupabaseStub = (sessionUserId: string, store: any) => {
  const pending: Promise<any>[] = [];
  const wrap = <T>(value: T) => {
    const promise = Promise.resolve(value);
    pending.push(promise);
    promise.finally(() => {
      const index = pending.indexOf(promise);
      if (index >= 0) {
        pending.splice(index, 1);
      }
    });
    return promise;
  };

  const supabase: any = {
    __flush: async () => {
      while (pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        await Promise.all(batch);
      }
    },
    auth: {
      getUser: async () => ({ data: { user: { id: sessionUserId } }, error: null }),
    },
    functions: {
      invoke: (name: string, options: any = {}) => {
        if (name === 'uaz-fetch-chats') {
          const credentialId = options?.body?.credentialId;
          const chats = store.chats.filter(
            (chat: any) => chat.credential_id === credentialId && chat.user_id === sessionUserId,
          );
          return wrap({ data: { chats, hasMore: false, total: chats.length }, error: null });
        }
        if (name === 'uaz-get-qr') {
          return wrap({ data: { status: 'connecting' }, error: null });
        }
        if (name === 'uaz-fetch-messages') {
          return wrap({ data: { messages: [], hasMore: false, nextOffset: 0 }, error: null });
        }
        if (name === 'uaz-fetch-contact-details') {
          return wrap({ data: null, error: null });
        }
        return wrap({ data: null, error: null });
      },
    },
    from: (table: string) => {
      if (table === 'credentials') {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              single: () => {
                const record = store.credentials.find(
                  (credential: any) => credential.id === value && credential.user_id === sessionUserId,
                );
                if (record) {
                  return wrap({ data: { instance_name: record.instance_name }, error: null });
                }
                return wrap({ data: null, error: null });
              },
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => wrap({ data: [], error: null }),
        };
      }
      if (table === 'messages') {
        return {
          insert: () => wrap({ data: null, error: null }),
        };
      }
      if (table === 'chats') {
        return {
          update: () => ({
            eq: () => wrap({ error: null }),
          }),
        };
      }
      return {
        select: () => wrap({ data: [], error: null }),
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

  return supabase;
};

test("cada sessão acessa apenas os dados do próprio usuário", async () => {
  const store = {
    credentials: [
      { id: "cred-a", user_id: "user-a", instance_name: "Instância A" },
      { id: "cred-b", user_id: "user-b", instance_name: "Instância B" },
    ],
    chats: [
      {
        id: "chat-a",
        credential_id: "cred-a",
        wa_chat_id: "wa-chat-a",
        name: "Cliente A",
        last_message: "Olá",
        last_message_timestamp: 1000,
        unread_count: 1,
        avatar: null,
        is_group: false,
        assigned_to: null,
        user_id: "user-a",
      },
      {
        id: "chat-b",
        credential_id: "cred-b",
        wa_chat_id: "wa-chat-b",
        name: "Cliente B",
        last_message: "Oi",
        last_message_timestamp: 2000,
        unread_count: 0,
        avatar: null,
        is_group: false,
        assigned_to: null,
        user_id: "user-b",
      },
    ],
  };

  const runSession = async (userId: string, credentialId: string) => {
    const reactStub = createReactStub();
    const storage = createStorage();
    storage.setItem("activeCredentialId", credentialId);
    const originalWindow = global.window;
    const originalLocalStorage = global.localStorage;
    global.window = { localStorage: storage, innerWidth: 1024 } as any;
    global.localStorage = storage as any;

    try {
      const supabaseStub = createSupabaseStub(userId, store);
      const chatSidebar = createStubComponent("ChatSidebar");
      const chatArea = createStubComponent("ChatArea");
      const qrCodeScanner = createStubComponent("QRCodeScanner");

      const { module, stubs } = loadIndexPage(reactStub, {
        supabase: supabaseStub,
        chatSidebar,
        chatArea,
        qrCodeScanner,
        toast: () => {},
      });

      const Index = module.default ?? module;

      reactStub.__render(Index, { user: { id: userId } });
      await supabaseStub.__flush();

      stubs.qrCodeScanner.lastProps.onConnected();
      reactStub.__render(Index, { user: { id: userId } });
      await supabaseStub.__flush();

      reactStub.__render(Index, { user: { id: userId } });
      await supabaseStub.__flush();

      return stubs.chatSidebar.lastProps.chats;
    } finally {
      global.window = originalWindow;
      global.localStorage = originalLocalStorage;
    }
  };

  const chatsUserA = await runSession("user-a", "cred-a");
  assert.equal(chatsUserA.length, 1);
  assert.equal(chatsUserA[0].id, "chat-a");

  const chatsUserB = await runSession("user-b", "cred-b");
  assert.equal(chatsUserB.length, 1);
  assert.equal(chatsUserB[0].id, "chat-b");

  assert.notEqual(chatsUserA[0].id, chatsUserB[0].id);
});

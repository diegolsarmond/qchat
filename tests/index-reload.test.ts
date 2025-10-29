import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
  const state = [];
  const cleanups = [];
  let hookIndex = 0;

  const getInitialValue = (value) => (typeof value === "function" ? value() : value);

  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (state.length <= index) {
        state.push(getInitialValue(initial));
      }
      const setState = (value) => {
        state[index] = typeof value === "function" ? value(state[index]) : value;
      };
      return [state[index], setState];
    },
    useEffect(callback) {
      const cleanup = callback();
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    },
  };

  react.__render = (Component, props) => {
    hookIndex = 0;
    return Component(props);
  };

  react.__getState = () => state;

  react.__runCleanups = () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      cleanup();
    }
  };

  return react;
};

const createStubComponent = (type) => {
  const component = (props) => {
    component.lastProps = props;
    component.callCount = (component.callCount || 0) + 1;
    return { type, props };
  };
  component.callCount = 0;
  return component;
};

const loadIndexPage = (reactStub, overrides = {}) => {
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

  const module = { exports: {} };
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
    from: (table) => {
      if (table === "credentials") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "users") {
        return {
          select: async () => ({ data: [], error: null }),
        };
      }
      if (table === "messages") {
        return {
          insert: async () => ({ data: null, error: null }),
        };
      }
      if (table === "chats") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
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

  const customRequire = (specifier) => {
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
        mergeFetchedMessages: (previous, fetched, reset) =>
          reset ? [...fetched] : [...previous, ...fetched],
      };
    }
    if (specifier === "@/lib/message-pagination") {
      return {
        createInitialMessagePagination: (limit) => ({ limit, offset: 0, hasMore: false }),
        applyMessagePaginationUpdate: (prev, receivedCount, options) => ({
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

  return { module: module.exports, stubs: { credentialSetup, qrCodeScanner } };
};

test("Index mantém credentialId após reload", async () => {
  const credentialQueries = [];
  const reactStub = createReactStub();
  const credentialComponent = createStubComponent("CredentialSetup");
  const qrComponent = createStubComponent("QRCodeScanner");

  const supabaseStub = {
    functions: {
      invoke: async () => ({ data: {}, error: null }),
    },
    from: (table) => {
      if (table === "credentials") {
        return {
          select: () => ({
            eq: (column, value) => {
              credentialQueries.push({ column, value });
              return {
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              };
            },
          }),
        };
      }
      if (table === "users") {
        return {
          select: async () => ({ data: [], error: null }),
        };
      }
      if (table === "chats") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          insert: async () => ({ data: null, error: null }),
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

  const { module, stubs } = loadIndexPage(reactStub, {
    credentialSetup: credentialComponent,
    qrCodeScanner: qrComponent,
    supabase: supabaseStub,
  });
  const Index = module.default ?? module;
  const firstRender = reactStub.__render(Index, { user: { id: "user" } });
  assert.equal(firstRender.type, stubs.credentialSetup);

  firstRender.props.onSetupComplete("cred-1");

  const secondRender = reactStub.__render(Index, { user: { id: "user" } });
  assert.equal(secondRender.type, stubs.qrCodeScanner);
  assert.equal(reactStub.__getState()[0], "cred-1");
  assert.deepEqual(credentialQueries, [{ column: "user_id", value: "user" }]);

  const reloadQueries = [];
  const reactStubReload = createReactStub();
  const reloadCredentialStub = createStubComponent("CredentialSetup");
  const reloadQrStub = createStubComponent("QRCodeScanner");
  const supabaseReloadStub = {
    functions: {
      invoke: async () => ({ data: {}, error: null }),
    },
    from: (table) => {
      if (table === "credentials") {
        return {
          select: () => ({
            eq: (column, value) => {
              reloadQueries.push({ column, value });
              return {
                order: () => ({
                  limit: async () => ({ data: [{ id: "cred-1" }], error: null }),
                }),
              };
            },
          }),
        };
      }
      if (table === "users") {
        return {
          select: async () => ({ data: [], error: null }),
        };
      }
      if (table === "chats") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          insert: async () => ({ data: null, error: null }),
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

  const { module: moduleReload, stubs: reloadStubs } = loadIndexPage(reactStubReload, {
    credentialSetup: reloadCredentialStub,
    qrCodeScanner: reloadQrStub,
    supabase: supabaseReloadStub,
  });
  const IndexReload = moduleReload.default ?? moduleReload;
  reactStubReload.__render(IndexReload, { user: { id: "user" } });
  await Promise.resolve();
  await Promise.resolve();
  const reloadRender = reactStubReload.__render(IndexReload, { user: { id: "user" } });
  assert.equal(reloadRender.type, reloadStubs.qrCodeScanner);
  assert.equal(reactStubReload.__getState()[0], "cred-1");
  assert.deepEqual(reloadQueries, [{ column: "user_id", value: "user" }]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
  const state = [];
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
    useEffect() {},
  };

  react.__render = (Component, props) => {
    hookIndex = 0;
    return Component(props);
  };

  react.__getState = () => state;

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

test("Index mantém credentialId após reload", () => {
  const storage = (() => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => {
        map.set(key, String(value));
      },
      removeItem: (key) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
    };
  })();

  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  global.window = { localStorage: storage, innerWidth: 1024 };
  global.localStorage = storage;

  try {
    const reactStub = createReactStub();
    const credentialComponent = createStubComponent("CredentialSetup");
    const qrComponent = createStubComponent("QRCodeScanner");
    const { module, stubs } = loadIndexPage(reactStub, {
      credentialSetup: credentialComponent,
      qrCodeScanner: qrComponent,
    });
    const Index = module.default ?? module;
    const firstRender = reactStub.__render(Index, { user: { id: "user" } });
    assert.equal(firstRender.type, stubs.credentialSetup);

    storage.setItem("activeCredentialId", "cred-1");
    firstRender.props.onSetupComplete("cred-1");

    const secondRender = reactStub.__render(Index, { user: { id: "user" } });
    assert.equal(secondRender.type, stubs.qrCodeScanner);
    assert.equal(reactStub.__getState()[0], "cred-1");
    assert.equal(storage.getItem("activeCredentialId"), "cred-1");

    const reactStubReload = createReactStub();
    const reloadCredentialStub = createStubComponent("CredentialSetup");
    const reloadQrStub = createStubComponent("QRCodeScanner");
    const { module: moduleReload, stubs: reloadStubs } = loadIndexPage(reactStubReload, {
      credentialSetup: reloadCredentialStub,
      qrCodeScanner: reloadQrStub,
    });
    const IndexReload = moduleReload.default ?? moduleReload;
    const reloadRender = reactStubReload.__render(IndexReload, { user: { id: "user" } });
    assert.equal(reloadRender.props.credentialId, "cred-1");
    assert.equal(reactStubReload.__getState()[0], "cred-1");
  } finally {
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
    if (originalLocalStorage === undefined) {
      delete global.localStorage;
    } else {
      global.localStorage = originalLocalStorage;
    }
  }
});

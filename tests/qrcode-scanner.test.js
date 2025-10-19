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
        if (typeof value === "function") {
          state[index] = value(state[index]);
        } else {
          state[index] = value;
        }
      };
      return [state[index], setState];
    },
    useEffect(callback) {
      const cleanup = callback();
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    },
    useRef(initialValue) {
      return { current: initialValue };
    },
  };

  react.__render = (Component, props) => {
    hookIndex = 0;
    cleanups.length = 0;
    return Component(props);
  };

  react.__runCleanups = () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      cleanup();
    }
  };

  react.__getState = () => state;

  return react;
};

const loadQRCodeScanner = (reactStub, options) => {
  const modulePath = fileURLToPath(new URL("../src/components/QRCodeScanner.tsx", import.meta.url));
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
  const { supabaseStub, toastStub } = options;

  const stubComponent = () => () => null;

  const customRequire = (specifier) => {
    if (specifier === "react") {
      return reactStub;
    }
    if (specifier === "react/jsx-runtime") {
      return requireFn(specifier);
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: supabaseStub };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: toastStub }) };
    }
    if (specifier.startsWith("@/components/ui/")) {
      return {
        Card: stubComponent(),
        CardContent: stubComponent(),
        CardDescription: stubComponent(),
        CardHeader: stubComponent(),
        CardTitle: stubComponent(),
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
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return module.exports;
};

test("QRCodeScanner interrompe polling após obter um QR code", async () => {
  const reactStub = createReactStub();
  const invokeCalls = [];
  const toastCalls = [];

  const supabaseStub = {
    functions: {
      async invoke() {
        invokeCalls.push("fetch");
        return { data: { qrCode: "data:image/png;base64,abc" }, error: null };
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data: { instance_name: "Instance" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const toastStub = (payload) => {
    toastCalls.push(payload);
  };

  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let intervalCallback;
  const clearedIntervals = [];

  global.setInterval = (callback) => {
    intervalCallback = callback;
    return 42;
  };
  global.clearInterval = (id) => {
    clearedIntervals.push(id);
  };

  try {
    const module = loadQRCodeScanner(reactStub, { supabaseStub, toastStub });
    const { QRCodeScanner } = module;

    reactStub.__render(QRCodeScanner, { credentialId: "cred", onConnected: () => {} });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(reactStub.__getState()[0], "data:image/png;base64,abc");

    assert.equal(invokeCalls.length, 1);
    assert.ok(intervalCallback, "interval callback should be registered");

    await intervalCallback();

    assert.equal(invokeCalls.length, 1);
    assert.ok(clearedIntervals.includes(42));
  } finally {
    reactStub.__runCleanups();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

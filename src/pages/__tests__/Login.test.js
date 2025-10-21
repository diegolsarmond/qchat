import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const loadLoginModule = (overrides = {}) => {
  const modulePath = fileURLToPath(new URL("../Login.tsx", import.meta.url));
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

  const actualReact = overrides.react ?? React;
  const stubComponent = overrides.stubComponent ?? (() => () => null);

  const createUiComponents = () => {
    const defaultComponents = {
      default: stubComponent(),
      Button: stubComponent(),
      Input: stubComponent(),
      Label: stubComponent(),
      Card: stubComponent(),
      CardHeader: stubComponent(),
      CardTitle: stubComponent(),
      CardContent: stubComponent(),
    };

    if (!overrides.uiComponents) {
      return defaultComponents;
    }

    return { ...defaultComponents, ...overrides.uiComponents };
  };

  const customRequire = (specifier) => {
    if (specifier === "react") return actualReact;
    if (specifier === "react/jsx-runtime") return requireFn(specifier);
    if (specifier === "react-router-dom") {
      return {
        useNavigate: () => () => {},
        Link: overrides.linkComponent ?? stubComponent(),
      };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: { auth: { signInWithPassword: async () => ({ data: null, error: null }) } } };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: () => {} }) };
    }
    if (specifier.startsWith("@/components/ui/")) {
      return createUiComponents();
    }
    return requireFn(specifier);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    console,
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return module.exports;
};

test("performLogin realiza sign-in e redireciona após sucesso", async () => {
  const signInCalls = [];
  const navigateCalls = [];
  const toastCalls = [];
  const loadingStates = [];

  const module = loadLoginModule();
  const performLogin = module.performLogin;

  const result = await performLogin({
    email: "usuario@example.com",
    password: "senha-segura",
    signInWithPassword: async (credentials) => {
      signInCalls.push(credentials);
      return { data: {}, error: null };
    },
    toast: (payload) => {
      toastCalls.push(payload);
    },
    navigate: (path) => {
      navigateCalls.push(path);
    },
    setLoading: (value) => {
      loadingStates.push(value);
    },
  });

  assert.equal(result, true);
  assert.equal(signInCalls.length, 1);
  assert.equal(signInCalls[0].email, "usuario@example.com");
  assert.equal(signInCalls[0].password, "senha-segura");
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0], "/");
  assert.equal(toastCalls.length, 1);
  assert.equal(toastCalls[0].title, "Bem-vindo");
  assert.deepEqual(loadingStates, [true, false]);
});

test("performLogin exibe erro quando signInWithPassword lança exceção", async () => {
  const navigateCalls = [];
  const toastCalls = [];
  const loadingStates = [];

  const module = loadLoginModule();
  const performLogin = module.performLogin;

  const result = await performLogin({
    email: "usuario@example.com",
    password: "senha-segura",
    signInWithPassword: async () => {
      throw new TypeError("Failed to fetch");
    },
    toast: (payload) => {
      toastCalls.push(payload);
    },
    navigate: (path) => {
      navigateCalls.push(path);
    },
    setLoading: (value) => {
      loadingStates.push(value);
    },
  });

  assert.equal(result, false);
  assert.equal(navigateCalls.length, 0);
  assert.equal(toastCalls.length, 1);
  assert.deepEqual(toastCalls[0], {
    title: "Erro ao entrar",
    description: "Failed to fetch",
    variant: "destructive",
  });
  assert.deepEqual(loadingStates, [true, false]);
});

test("botão de visualizar senha alterna o tipo do campo", () => {
  const actualReact = React;
  const states = [];
  let callIndex = 0;

  const reactStub = {
    ...actualReact,
    useState: (initialValue) => {
      const index = callIndex;
      callIndex += 1;

      if (states.length <= index) {
        states.push(initialValue);
      }

      const setState = (value) => {
        const nextValue = typeof value === "function" ? value(states[index]) : value;
        states[index] = nextValue;
      };

      return [states[index], setState];
    },
  };

  const resetHooks = () => {
    callIndex = 0;
  };

  const uiComponents = {
    Button: (props) => reactStub.createElement("button", props),
    Input: (props) => reactStub.createElement("input", props),
    Label: (props) => reactStub.createElement("label", props),
    Card: (props) => reactStub.createElement("div", props),
    CardHeader: (props) => reactStub.createElement("div", props),
    CardTitle: (props) => reactStub.createElement("div", props),
    CardContent: (props) => reactStub.createElement("div", props),
  };

  const linkComponent = (props) => reactStub.createElement("a", props);

  const module = loadLoginModule({
    react: reactStub,
    uiComponents,
    linkComponent,
  });

  const Login = module.default;

  const renderLogin = () => {
    resetHooks();
    return Login();
  };

  const findElement = (node, predicate) => {
    if (!node || typeof node !== "object") {
      return null;
    }

    if (predicate(node)) {
      return node;
    }

    const { children } = node.props ?? {};

    if (!children) {
      return null;
    }

    const childArray = Array.isArray(children) ? children : [children];

    for (const child of childArray) {
      if (typeof child !== "object" || child === null) {
        continue;
      }

      const found = findElement(child, predicate);

      if (found) {
        return found;
      }
    }

    return null;
  };

  const firstRender = renderLogin();

  const passwordInput = findElement(
    firstRender,
    (element) => element.type === "input" && element.props?.id === "password",
  );

  assert.ok(passwordInput);
  assert.equal(passwordInput.props.type, "password");

  const toggleButton = findElement(
    firstRender,
    (element) => element.type === "button" && element.props?.type === "button",
  );

  assert.ok(toggleButton);
  assert.equal(toggleButton.props.children, "Mostrar");

  toggleButton.props.onClick();

  const secondRender = renderLogin();

  const updatedInput = findElement(
    secondRender,
    (element) => element.type === "input" && element.props?.id === "password",
  );

  assert.ok(updatedInput);
  assert.equal(updatedInput.props.type, "text");

  const updatedButton = findElement(
    secondRender,
    (element) => element.type === "button" && element.props?.type === "button",
  );

  assert.ok(updatedButton);
  assert.equal(updatedButton.props.children, "Ocultar");
});

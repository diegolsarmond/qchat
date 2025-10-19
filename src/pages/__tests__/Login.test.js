import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const loadLoginModule = () => {
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

  const stubComponent = () => () => null;

  const customRequire = (specifier) => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return requireFn(specifier);
    if (specifier === "react-router-dom") {
      return { useNavigate: () => () => {} };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: { auth: { signInWithPassword: async () => ({ data: null, error: null }) } } };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: () => {} }) };
    }
    if (specifier.startsWith("@/components/ui/")) {
      return {
        default: stubComponent(),
        Button: stubComponent(),
        Input: stubComponent(),
        Label: stubComponent(),
        Card: stubComponent(),
        CardHeader: stubComponent(),
        CardTitle: stubComponent(),
        CardContent: stubComponent(),
      };
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

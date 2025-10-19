import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const loadRegisterModule = () => {
  const modulePath = fileURLToPath(new URL("../src/pages/Register.tsx", import.meta.url));
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
      return { useNavigate: () => () => {}, Link: stubComponent() };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: { auth: { signUp: async () => ({ data: null, error: null }) } } };
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

test("performRegister realiza sign-up e redireciona após sucesso", async () => {
  const signUpCalls = [];
  const navigateCalls = [];
  const toastCalls = [];
  const loadingStates = [];

  const module = loadRegisterModule();
  const performRegister = module.performRegister;

  const result = await performRegister({
    email: "novo@example.com",
    password: "senha-forte",
    signUp: async (credentials) => {
      signUpCalls.push(credentials);
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
  assert.equal(signUpCalls.length, 1);
  assert.equal(signUpCalls[0].email, "novo@example.com");
  assert.equal(signUpCalls[0].password, "senha-forte");
  assert.equal(navigateCalls.length, 1);
  assert.equal(navigateCalls[0], "/login");
  assert.equal(toastCalls.length, 1);
  assert.equal(toastCalls[0].title, "Conta criada");
  assert.deepEqual(loadingStates, [true, false]);
});

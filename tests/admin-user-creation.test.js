import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";

const loadAdminModule = () => {
  const modulePath = fileURLToPath(new URL("../src/pages/Admin.tsx", import.meta.url));
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
    if (specifier === "lucide-react") {
      return { Loader2: stubComponent() };
    }
    if (specifier === "@/integrations/supabase/client") {
      return {
        supabase: {
          auth: {
            getSession: async () => ({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            admin: { createUser: async () => ({ data: null, error: null }) },
          },
          from: () => ({ select: async () => ({ count: 0 }) }),
          functions: { invoke: async () => ({ data: null, error: null }) },
        },
      };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: () => {} }) };
    }
    if (specifier.startsWith("@/components/ui/")) {
      return {
        default: stubComponent(),
        Button: stubComponent(),
        Card: stubComponent(),
        CardContent: stubComponent(),
        CardDescription: stubComponent(),
        CardHeader: stubComponent(),
        CardTitle: stubComponent(),
        Input: stubComponent(),
        Label: stubComponent(),
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

test("performAdminUserCreation cria usuário e atualiza métricas", async () => {
  const createUserCalls = [];
  const statsCalls = [];
  const toastCalls = [];

  const module = loadAdminModule();
  const performAdminUserCreation = module.performAdminUserCreation;

  const result = await performAdminUserCreation({
    email: "colaborador@empresa.com",
    password: "senhaSegura123",
      createUser: async (payload) => {
        createUserCalls.push(payload);
        return { error: null };
      },
    fetchCounts: async () => ({ usersCount: 5, chatsCount: 12 }),
    updateStats: (stats) => {
      statsCalls.push(stats);
    },
    toast: (options) => {
      toastCalls.push(options);
    },
  });

  assert.equal(result, true);
  assert.equal(createUserCalls.length, 1);
  assert.equal(createUserCalls[0].email, "colaborador@empresa.com");
  assert.equal(createUserCalls[0].password, "senhaSegura123");
  assert.equal(statsCalls.length, 1);
  assert.equal(statsCalls[0][0].value, "5");
  assert.equal(statsCalls[0][1].value, "12");
  assert.equal(toastCalls.length, 1);
  assert.equal(toastCalls[0].title, "Usuário criado");
  assert.equal(toastCalls[0].description, "Cadastro disponibilizado com sucesso");
});

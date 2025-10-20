import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const createReactStub = () => {
  const state: any[] = [];
  const cleanups: Array<() => void> = [];
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
    useEffect(callback: () => void | (() => void)) {
      const cleanup = callback();
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    },
  };

  react.__render = (Component: any, props: any) => {
    hookIndex = 0;
    return Component(props);
  };

  react.__runCleanups = () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      cleanup?.();
    }
  };

  return react;
};

const createStubElement = (type: string) => {
  const component = ({ children, ...rest }: any) => ({
    type,
    props: { ...rest, children },
  });
  return component;
};

const loadCredentialSetup = (reactStub: any, options: any = {}) => {
  const modulePath = fileURLToPath(new URL("../src/components/CredentialSetup.tsx", import.meta.url));
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

  const toastStub = options.toast ?? (() => {});
  const supabaseStub = options.supabase;

  const customRequire = (specifier: string) => {
    if (specifier === "react") {
      return reactStub;
    }
    if (specifier === "react/jsx-runtime") {
      return requireFn(specifier);
    }
    if (specifier === "@/components/ui/card") {
      return {
        Card: createStubElement("div"),
        CardHeader: createStubElement("div"),
        CardContent: createStubElement("div"),
        CardTitle: createStubElement("h2"),
        CardDescription: createStubElement("p"),
      };
    }
    if (specifier === "@/components/ui/input") {
      return { Input: createStubElement("input") };
    }
    if (specifier === "@/components/ui/label") {
      return { Label: createStubElement("label") };
    }
    if (specifier === "@/components/ui/button") {
      return { Button: createStubElement("button") };
    }
    if (specifier === "lucide-react") {
      return { MessageSquare: createStubElement("icon") };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: toastStub }) };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: supabaseStub };
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

const findElement = (node: any, predicate: (entry: any) => boolean): any => {
  if (!node) {
    return null;
  }

  if (predicate(node)) {
    return node;
  }

  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, predicate);
      if (found) {
        return found;
      }
    }
  } else if (children) {
    return findElement(children, predicate);
  }

  return null;
};

test("CredentialSetup inclui user_id ao salvar credenciais", async () => {
  const reactStub = createReactStub();
  const insertCalls: any[] = [];
  const selectFilters: Array<{ column: string; value: string }> = [];

  const supabaseStub = {
    auth: {
      async getUser() {
        return { data: { user: { id: "user-123" } }, error: null };
      },
    },
    from: (table: string) => {
      if (table === "credentials") {
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              selectFilters.push({ column, value });
              return {
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              };
            },
          }),
          insert: (payload: any) => {
            insertCalls.push(payload);
            return {
              select: () => ({
                single: async () => ({ data: { id: "cred-xyz" }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const module = loadCredentialSetup(reactStub, { supabase: supabaseStub });
  const { CredentialSetup } = module;

  const onSetupCompleteCalls: string[] = [];
  const tree = reactStub.__render(CredentialSetup, {
    onSetupComplete: (id: string) => {
      onSetupCompleteCalls.push(id);
    },
  });

  await Promise.resolve();
  await Promise.resolve();

  const form = findElement(tree, (entry) => entry?.type === "form");
  assert.ok(form, "form deve existir");

  const instanceInput = findElement(tree, (entry) => entry?.type === "input" && entry.props?.id === "instanceName");
  const subdomainInput = findElement(tree, (entry) => entry?.type === "input" && entry.props?.id === "subdomain");
  const tokenInput = findElement(tree, (entry) => entry?.type === "input" && entry.props?.id === "token");

  assert.ok(instanceInput);
  assert.ok(subdomainInput);
  assert.ok(tokenInput);

  await instanceInput.props.onChange({ target: { value: "Minha Instância" } });
  await subdomainInput.props.onChange({ target: { value: "empresa" } });
  await tokenInput.props.onChange({ target: { value: "secreto" } });

  await form.props.onSubmit({ preventDefault() {} });

  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].user_id, "user-123");
  assert.equal(insertCalls[0].instance_name, "Minha Instância");
  assert.deepEqual(selectFilters, [{ column: "user_id", value: "user-123" }]);
  assert.deepEqual(onSetupCompleteCalls, ["cred-xyz"]);
});

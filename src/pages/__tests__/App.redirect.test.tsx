import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

type SupabaseMock = {
  calls: string[];
  auth: {
    getSession: () => Promise<{ data: { session: null } }>;
    onAuthStateChange: (
      callback: (event: unknown, session: null) => void
    ) => { data: { subscription: { unsubscribe: () => void } } };
  };
};

type ReactTestEnv = {
  React: {
    useState: <T>(initial: T) => [T, (value: T | ((prev: T) => T)) => void];
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => void;
    cloneElement: <P extends Record<string, unknown>>(element: any, props: P) => any;
    createElement: (type: any, props?: Record<string, unknown>, ...children: any[]) => any;
    Fragment: symbol;
  };
  jsxRuntime: {
    jsx: (type: any, props: Record<string, unknown>) => any;
    jsxs: (type: any, props: Record<string, unknown>) => any;
    Fragment: symbol;
  };
  render: (component: (props: any) => any, props: any) => Promise<void>;
  settle: () => Promise<void>;
  getOutput: () => any;
};

const createSupabaseMock = (): SupabaseMock => {
  const calls: string[] = [];
  return {
    calls,
    auth: {
      getSession: async () => {
        calls.push("getSession");
        return { data: { session: null } };
      },
      onAuthStateChange: () => {
        calls.push("onAuthStateChange");
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  };
};

const createReactTestEnv = (): ReactTestEnv => {
  const states: unknown[] = [];
  const depsList: (unknown[] | undefined)[] = [];
  const cleanups: (() => void)[] = [];
  let hookIndex = 0;
  let component: ((props: any) => any) | null = null;
  let props: any;
  let output: any;
  let pendingRenders = 0;
  let queue: Promise<void> = Promise.resolve();
  let pendingEffects: (() => void | (() => void))[] = [];

  const runComponent = async () => {
    hookIndex = 0;
    const effectsToRun: (() => void | (() => void))[] = [];
    pendingEffects = effectsToRun;
    const previousCleanups = cleanups.splice(0);
    output = component ? component(props) : null;
    pendingEffects = [];
    for (const cleanup of previousCleanups) {
      cleanup?.();
    }
    for (const effect of effectsToRun) {
      const cleanup = effect();
      if (typeof cleanup === "function") {
        cleanups.push(cleanup);
      }
    }
  };

  const scheduleRender = () => {
    pendingRenders += 1;
    queue = queue.then(async () => {
      pendingRenders -= 1;
      await runComponent();
    });
  };

  const React = {
    useState<T>(initial: T): [T, (value: T | ((prev: T) => T)) => void] {
      const index = hookIndex++;
      if (!(index in states)) {
        states[index] = initial;
      }
      const setState = (value: T | ((prev: T) => T)) => {
        const previous = states[index] as T;
        const next = typeof value === "function" ? (value as (prev: T) => T)(previous) : value;
        if (!Object.is(previous, next)) {
          states[index] = next;
          scheduleRender();
        }
      };
      return [states[index] as T, setState];
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = hookIndex++;
      const previous = depsList[index];
      let shouldRun = false;
      if (!deps) {
        shouldRun = true;
      } else if (!previous) {
        shouldRun = true;
      } else if (deps.length !== previous.length) {
        shouldRun = true;
      } else {
        for (let i = 0; i < deps.length; i++) {
          if (!Object.is(deps[i], previous[i])) {
            shouldRun = true;
            break;
          }
        }
      }
      depsList[index] = deps;
      if (shouldRun) {
        pendingEffects.push(effect);
      }
    },
    cloneElement<P extends Record<string, unknown>>(element: any, props: P) {
      return {
        ...element,
        props: { ...(element?.props ?? {}), ...props },
      };
    },
    createElement(type: any, props?: Record<string, unknown>, ...children: any[]) {
      return {
        type,
        props: {
          ...(props ?? {}),
          children: children.length <= 1 ? children[0] : children,
        },
      };
    },
    Fragment: Symbol.for("react.fragment"),
  };

  const jsxRuntime = {
    jsx(type: any, props: Record<string, unknown>) {
      return React.createElement(type, props);
    },
    jsxs(type: any, props: Record<string, unknown>) {
      return React.createElement(type, props);
    },
    Fragment: React.Fragment,
  };

  return {
    React,
    jsxRuntime,
    async render(renderComponent, renderProps) {
      component = renderComponent;
      props = renderProps;
      states.length = 0;
      depsList.length = 0;
      cleanups.splice(0);
      queue = Promise.resolve();
      pendingRenders = 0;
      scheduleRender();
      await this.flush();
    },
    async settle() {
      for (let i = 0; i < 10; i++) {
        await this.flush();
        await Promise.resolve();
        if (pendingRenders === 0) {
          await Promise.resolve();
          if (pendingRenders === 0) {
            break;
          }
        }
      }
      await this.flush();
    },
    getOutput() {
      return output;
    },
    async flush() {
      while (pendingRenders > 0) {
        await queue;
      }
    },
  };
};

const loadAppModule = (env: ReactTestEnv, supabase: SupabaseMock) => {
  const modulePath = fileURLToPath(new URL("../../App.tsx", import.meta.url));
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

  const module = { exports: {} as any };
  const requireFn = createRequire(modulePath);

  const componentStub = () => null;

  const customRequire = (specifier: string) => {
    if (specifier === "react") return env.React;
    if (specifier === "react/jsx-runtime") return env.jsxRuntime;
    if (specifier === "react-router-dom") {
      return {
        BrowserRouter: ({ children }: { children: any }) => children,
        Routes: ({ children }: { children: any }) => children,
        Route: ({ element }: { element: any }) => element,
        Navigate: (props: Record<string, unknown>) => ({ type: "Navigate", props }),
      };
    }
    if (specifier === "@tanstack/react-query") {
      return {
        QueryClient: class {},
        QueryClientProvider: ({ children }: { children: any }) => children,
      };
    }
    if (specifier === "@/components/ui/toaster") {
      return { Toaster: componentStub };
    }
    if (specifier === "@/components/ui/sonner") {
      return { Toaster: componentStub };
    }
    if (specifier === "@/components/ui/tooltip") {
      return { TooltipProvider: ({ children }: { children: any }) => children };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase };
    }
    if (specifier === "./pages/Index") {
      return { default: componentStub };
    }
    if (specifier === "./pages/NotFound") {
      return { default: componentStub };
    }
    if (specifier === "./pages/Login") {
      return { default: componentStub };
    }
    if (specifier === "./pages/Register") {
      return { default: componentStub };
    }
    if (specifier === "./pages/Admin") {
      return { default: componentStub };
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

test("redireciona para /login quando não há sessão ativa", async () => {
  const supabase = createSupabaseMock();
  const env = createReactTestEnv();
  const appModule = loadAppModule(env, supabase);
  const ProtectedRoute = appModule.ProtectedRoute as (props: { element: any }) => any;

  await env.render(ProtectedRoute, {
    element: env.React.createElement("Index", {}),
  });

  await env.settle();

  const result = env.getOutput();

  assert.equal(result?.type, "Navigate");
  assert.equal(result?.props?.to, "/login");
  assert.equal(supabase.calls.includes("getSession"), true);
  assert.equal(supabase.calls.includes("onAuthStateChange"), true);
});

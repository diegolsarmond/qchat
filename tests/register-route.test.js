import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const loadAppModule = () => {
  const modulePath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
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
  const baseRequire = createRequire(modulePath);
  const capturedRoutes = [];

  const pageStubs = {
    "./pages/Index": function IndexPage() {
      return null;
    },
    "./pages/NotFound": function NotFoundPage() {
      return null;
    },
    "./pages/Login": function LoginPage() {
      return null;
    },
    "./pages/Admin": function AdminPage() {
      return null;
    },
    "./pages/Register": function RegisterPage() {
      return null;
    },
  };

  const customRequire = (specifier) => {
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return baseRequire(specifier);
    if (specifier === "@tanstack/react-query") {
      return {
        QueryClient: class QueryClient {},
        QueryClientProvider: ({ children }) => children,
      };
    }
    if (specifier === "react-router-dom") {
      return {
        BrowserRouter: ({ children }) => children,
        Routes: ({ children }) => children,
        Route: (props) => {
          capturedRoutes.push(props);
          return null;
        },
        Navigate: function NavigateComponent() {
          return null;
        },
        Link: ({ children }) => React.createElement("a", null, children),
        useNavigate: () => () => {},
      };
    }
    if (specifier === "@/components/ui/toaster") {
      return { Toaster: () => null };
    }
    if (specifier === "@/components/ui/sonner") {
      return { Toaster: () => null };
    }
    if (specifier === "@/components/ui/tooltip") {
      return { TooltipProvider: ({ children }) => children };
    }
    if (specifier === "@/integrations/supabase/client") {
      return {
        supabase: {
          auth: {
            getSession: async () => ({ data: { session: null } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          },
        },
      };
    }
    if (Object.prototype.hasOwnProperty.call(pageStubs, specifier)) {
      return { __esModule: true, default: pageStubs[specifier] };
    }
    return baseRequire(specifier);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    console,
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return { module: module.exports, capturedRoutes, pageStubs };
};

test("rota /register utiliza componente Register", () => {
  const { module, capturedRoutes, pageStubs } = loadAppModule();
  const App = module.default;

  renderToStaticMarkup(React.createElement(App));

  const registerRoute = capturedRoutes.find((route) => route.path === "/register");
  assert.ok(registerRoute, "Rota /register não foi definida");

  const registerComponent = pageStubs["./pages/Register"];
  assert.equal(registerRoute.element?.type, registerComponent);
});

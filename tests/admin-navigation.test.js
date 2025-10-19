import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const modulePath = fileURLToPath(new URL("../src/pages/__tests__/AdminNavigation.test.tsx", import.meta.url));
const source = readFileSync(modulePath, "utf-8");

const transpile = (code, fileName) =>
  ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName,
  });

const { outputText } = transpile(source, modulePath);

const module = { exports: {} };
const baseRequire = createRequire(modulePath);

const resolveCandidate = (specifier) => {
  if (specifier.startsWith("@/")) {
    return path.resolve(path.dirname(modulePath), "..", "..", specifier.slice(2));
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.resolve(path.dirname(modulePath), specifier);
  }
  return null;
};

const customRequire = (specifier) => {
  if (specifier === "react-router-dom") {
    const actual = baseRequire(specifier);
    const holder = context.__CHAT_SIDEBAR_NAVIGATE__;
    if (holder && typeof holder === "object" && "fn" in holder) {
      return {
        ...actual,
        useNavigate: () => holder.fn,
      };
    }
    return actual;
  }

  try {
    return baseRequire(specifier);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      const basePath = resolveCandidate(specifier);
      if (basePath) {
        const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
        for (const ext of extensions) {
          const candidate = basePath.endsWith(ext) ? basePath : basePath + ext;
          if (existsSync(candidate)) {
            if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
              const childSource = readFileSync(candidate, "utf-8");
              const { outputText: childOutput } = transpile(childSource, candidate);
              const childModule = { exports: {} };
              const childContext = vm.createContext({
                module: childModule,
                exports: childModule.exports,
                require: customRequire,
                __dirname: path.dirname(candidate),
                __filename: candidate,
                console,
                setTimeout,
                clearTimeout,
                setInterval,
                clearInterval,
              });
              new vm.Script(childOutput, { filename: candidate }).runInContext(childContext);
              return childModule.exports;
            }
            return baseRequire(candidate);
          }
        }
      }
    }
    throw error;
  }
};

const context = vm.createContext({
  module,
  exports: module.exports,
  require: customRequire,
  __dirname: path.dirname(modulePath),
  __filename: modulePath,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
});

new vm.Script(outputText, { filename: modulePath }).runInContext(context);

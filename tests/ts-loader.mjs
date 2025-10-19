import { readFile } from "node:fs/promises";
import ts from "typescript";

const extensions = new Set([".ts", ".tsx"]);

export async function resolve(specifier, context, defaultResolve) {
  if (extensions.has(getExtension(specifier))) {
    const { parentURL = import.meta.url } = context;
    const url = new URL(specifier, parentURL).href;
    return { url, shortCircuit: true };
  }
  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (extensions.has(getExtension(url))) {
    const source = await readFile(new URL(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: url,
    });
    return { format: "module", shortCircuit: true, source: outputText };
  }
  return defaultLoad(url, context, defaultLoad);
}

function getExtension(specifier) {
  const withoutQuery = specifier.split("?")[0].split("#")[0];
  const index = withoutQuery.lastIndexOf(".");
  return index >= 0 ? withoutQuery.slice(index) : "";
}

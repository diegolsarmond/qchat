import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

test("Index transpila sem diagnósticos", () => {
  const modulePath = fileURLToPath(new URL("../src/pages/Index.tsx", import.meta.url));
  const source = readFileSync(modulePath, "utf-8");
  const { diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: modulePath,
    reportDiagnostics: true,
  });

  assert.equal((diagnostics ?? []).length, 0);
});

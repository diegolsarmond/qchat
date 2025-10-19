import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert";
import test from "node:test";

test("App importa a página de administração", () => {
  const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url));
  const source = readFileSync(appPath, "utf-8");
  const pattern = /import\s+Admin\s+from\s+["']\.\/pages\/Admin["'];/;
  assert.ok(pattern.test(source));
});

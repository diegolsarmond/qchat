import test from "node:test";
import { strictEqual, notStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const modulePath = fileURLToPath(new URL("../src/lib/message-order.ts", import.meta.url));
const source = readFileSync(modulePath, "utf-8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
  fileName: modulePath,
});

const module = { exports: {} };
const context = vm.createContext({
  module,
  exports: module.exports,
  require: createRequire(modulePath),
  __dirname: path.dirname(modulePath),
  __filename: modulePath,
});

new vm.Script(outputText, { filename: modulePath }).runInContext(context);

const { normalizeFetchedMessages, mergeFetchedMessages } = module.exports;

test("normalizeFetchedMessages devolve mensagens em ordem cronológica", () => {
  const fetched = [
    { id: "3" },
    { id: "2" },
    { id: "1" },
  ];

  const normalized = normalizeFetchedMessages(fetched);

  strictEqual(
    JSON.stringify(normalized.map(message => message.id)),
    JSON.stringify(["1", "2", "3"]),
  );
  strictEqual(
    JSON.stringify(fetched.map(message => message.id)),
    JSON.stringify(["3", "2", "1"]),
  );
  notStrictEqual(normalized, fetched);
});

test("mergeFetchedMessages prefixa mensagens mais antigas mantendo ordem", () => {
  const previous = [
    { id: "4" },
    { id: "5" },
  ];

  const fetched = [
    { id: "3" },
    { id: "2" },
  ];

  const result = mergeFetchedMessages(previous, fetched, false);

  strictEqual(
    JSON.stringify(result.map(message => message.id)),
    JSON.stringify(["2", "3", "4", "5"]),
  );
  strictEqual(
    JSON.stringify(previous.map(message => message.id)),
    JSON.stringify(["4", "5"]),
  );
  strictEqual(
    JSON.stringify(fetched.map(message => message.id)),
    JSON.stringify(["3", "2"]),
  );
});

test("mergeFetchedMessages ignora mensagens duplicadas ao prefixar", () => {
  const previous = [
    { id: "2" },
    { id: "3" },
  ];

  const fetched = [
    { id: "3" },
    { id: "1" },
  ];

  const result = mergeFetchedMessages(previous, fetched, false);

  strictEqual(
    JSON.stringify(result.map(message => message.id)),
    JSON.stringify(["1", "2", "3"]),
  );
});

test("mergeFetchedMessages substitui estado ao resetar", () => {
  const previous = [
    { id: "10" },
  ];

  const fetched = [
    { id: "2" },
    { id: "1" },
  ];

  const result = mergeFetchedMessages(previous, fetched, true);

  strictEqual(
    JSON.stringify(result.map(message => message.id)),
    JSON.stringify(["1", "2"]),
  );
  strictEqual(
    JSON.stringify(fetched.map(message => message.id)),
    JSON.stringify(["2", "1"]),
  );
});

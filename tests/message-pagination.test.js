import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const modulePath = fileURLToPath(new URL("../src/lib/message-pagination.ts", import.meta.url));
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

const {
  createInitialMessagePagination,
  applyMessagePaginationUpdate,
} = module.exports;

test("createInitialMessagePagination inicia estado com valores padrão", () => {
  const pagination = createInitialMessagePagination(25);
  assert.equal(pagination.limit, 25);
  assert.equal(pagination.offset, 0);
  assert.equal(pagination.hasMore, false);
});

test("applyMessagePaginationUpdate redefine offset quando resetar", () => {
  const initial = createInitialMessagePagination(10);
  const updated = applyMessagePaginationUpdate(initial, 7, { reset: true, hasMore: true, limit: 15 });
  assert.equal(updated.limit, 15);
  assert.equal(updated.offset, 7);
  assert.equal(updated.hasMore, true);
});

test("applyMessagePaginationUpdate acumula offset para novas páginas", () => {
  const initial = { limit: 30, offset: 20, hasMore: true };
  const updated = applyMessagePaginationUpdate(initial, 5, { hasMore: false });
  assert.equal(updated.limit, 30);
  assert.equal(updated.offset, 25);
  assert.equal(updated.hasMore, false);
});

test("paginacao sequencial usa offset acumulado para evitar lotes repetidos", () => {
  const limit = 2;
  const dataset = ["m1", "m2", "m3", "m4"];
  const fetchBatch = (offset) => dataset.slice(offset, offset + limit);

  const initial = createInitialMessagePagination(limit);
  const firstBatch = fetchBatch(initial.offset);
  const firstNextOffset = initial.offset + firstBatch.length;
  const afterFirst = applyMessagePaginationUpdate(initial, firstNextOffset, {
    reset: true,
    hasMore: true,
    limit,
  });

  const secondBatch = fetchBatch(afterFirst.offset);
  const secondNextOffset = afterFirst.offset + secondBatch.length;
  const afterSecond = applyMessagePaginationUpdate(afterFirst, secondNextOffset - afterFirst.offset, {
    hasMore: false,
  });

  assert.equal(afterFirst.offset, firstNextOffset);
  assert.equal(afterSecond.offset, secondNextOffset);
  assert.equal(firstBatch.length, limit);
  assert.equal(secondBatch.length, limit);
  const firstIds = new Set(firstBatch);
  for (const id of secondBatch) {
    assert.equal(firstIds.has(id), false);
  }
});

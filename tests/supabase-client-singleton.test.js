import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const originalUrl = process.env.VITE_SUPABASE_URL;
const originalKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test('reutiliza a mesma instância do cliente supabase', async () => {
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const moduleUrl = new URL('../src/integrations/supabase/client.ts', import.meta.url);
    const modulePath = fileURLToPath(moduleUrl);
    const source = readFileSync(modulePath, 'utf-8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
      },
      fileName: modulePath,
    });

    const patchedOutput = outputText.replace(/import\.meta/g, 'globalThis.__import_meta__');

    const requireFn = createRequire(modulePath);

    let createCount = 0;
    const clients = [];

    const customRequire = (specifier) => {
      if (specifier === '@supabase/supabase-js') {
        return {
          createClient: (...args) => {
            createCount += 1;
            const client = { args };
            clients.push(client);
            return client;
          }
        };
      }
      if (specifier === './types') {
        return {};
      }
      return requireFn(specifier);
    };

    const script = new vm.Script(patchedOutput, { filename: modulePath });

    const createContext = (initial = {}) => {
      const module = { exports: {} };
      const context = vm.createContext({
        module,
        exports: module.exports,
        require: customRequire,
        process,
        console,
        ...initial,
      });
      context.globalThis = context;
      return context;
    };

    const firstContext = createContext();
    script.runInContext(firstContext);
    const firstClient = firstContext.module.exports.supabase;
    const storedClient = vm.runInContext('globalThis.__supabaseClient__', firstContext);
    assert.strictEqual(firstClient, storedClient);

    const secondContext = createContext({ __supabaseClient__: storedClient });
    script.runInContext(secondContext);
    const secondClient = secondContext.module.exports.supabase;

    assert.equal(createCount, 1);
    assert.strictEqual(secondClient, storedClient);
    assert.deepEqual(clients[0].args[0], 'http://localhost:54321');
  } finally {
    if (originalUrl === undefined) {
      delete process.env.VITE_SUPABASE_URL;
    } else {
      process.env.VITE_SUPABASE_URL = originalUrl;
    }

    if (originalKey === undefined) {
      delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY = originalKey;
    }
  }
});

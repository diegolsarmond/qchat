import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const originalUrl = process.env.VITE_SUPABASE_URL;
const originalKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test('usa porta local padrão ao criar o cliente supabase', async () => {
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

    const module = { exports: {} };
    const requireFn = createRequire(modulePath);

    let capturedUrl = '';

    const customRequire = (specifier) => {
      if (specifier === '@supabase/supabase-js') {
        return {
          createClient: (url) => {
            capturedUrl = url;
            return {};
          }
        };
      }
      if (specifier === './types') {
        return {};
      }
      return requireFn(specifier);
    };

    vm.runInNewContext(outputText, {
      module,
      exports: module.exports,
      require: customRequire,
      process,
      console,
    }, { filename: modulePath });

    assert.equal(capturedUrl, 'http://localhost:54321');
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

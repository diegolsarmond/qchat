import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const moduleUrl = new URL('../src/integrations/supabase/client.ts', import.meta.url);
const modulePath = fileURLToPath(moduleUrl);
const source = readFileSync(modulePath, 'utf-8');

const loadSupabaseClientUrl = ({ importMetaEnv, processEnv } = {}) => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: modulePath,
  });

  const patchedOutput = outputText.replace(/import\.meta/g, 'globalThis.__import_meta__');

  const capture = { url: '' };
  const contextProcess = { env: { ...(processEnv ?? {}) } };

  const module = { exports: {} };

  const sandbox = {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (specifier === '@supabase/supabase-js') {
        return {
          createClient: (url) => {
            capture.url = url;
            return {};
          }
        };
      }

      if (specifier === './types') {
        return {};
      }

      throw new Error(`Módulo inesperado: ${specifier}`);
    },
    console,
    process: contextProcess,
  };

  sandbox.globalThis = sandbox;

  if (importMetaEnv) {
    sandbox.__import_meta__ = { env: importMetaEnv };
  }

  vm.runInNewContext(patchedOutput, sandbox, { filename: modulePath });

  return capture.url;
};

test('usa porta local padrão ao criar o cliente supabase', () => {
  const capturedUrl = loadSupabaseClientUrl();
  assert.equal(capturedUrl, 'http://localhost:54321');
});

test('utiliza a url definida em import.meta.env quando disponível', () => {
  const capturedUrl = loadSupabaseClientUrl({
    importMetaEnv: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
    },
  });

  assert.equal(capturedUrl, 'https://example.supabase.co');
});

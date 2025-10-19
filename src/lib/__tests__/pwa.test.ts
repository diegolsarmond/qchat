import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { registerServiceWorker } from "../pwa.ts";

type RegisterImpl = (url: string) => Promise<unknown>;

function mockEnv(t: TestContext, prod: boolean): void {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = prod ? "production" : "development";
  t.after(() => {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  });
}

function mockNavigator(t: TestContext, register?: RegisterImpl): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  if (register) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: {
        serviceWorker: {
          register,
        },
      } as unknown as Navigator,
    });
  } else {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: {} as Navigator,
    });
  }
  t.after(() => {
    if (descriptor) {
      Object.defineProperty(globalThis, "navigator", descriptor);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
  });
}

test("registra o service worker em produção quando suportado", async (t) => {
  let chamadas = 0;
  mockEnv(t, true);
  mockNavigator(t, async (url) => {
    chamadas += 1;
    assert.equal(url, "/sw.js");
    return undefined;
  });
  registerServiceWorker();
  await Promise.resolve();
  assert.equal(chamadas, 1);
});

test("não registra o service worker fora de produção", async (t) => {
  let chamadas = 0;
  mockEnv(t, false);
  mockNavigator(t, async () => {
    chamadas += 1;
    return undefined;
  });
  registerServiceWorker();
  await Promise.resolve();
  assert.equal(chamadas, 0);
});

test("não registra quando o service worker não é suportado", async (t) => {
  mockEnv(t, true);
  mockNavigator(t);
  registerServiceWorker();
  await Promise.resolve();
  assert.equal("serviceWorker" in navigator, false);
});

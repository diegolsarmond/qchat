import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const loadIndexModule = () => {
  const modulePath = fileURLToPath(new URL("../src/pages/Index.tsx", import.meta.url));
  const source = readFileSync(modulePath, "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: modulePath,
  });

  const module = { exports: {} };
  const requireFn = createRequire(modulePath);

  const reactStub = {
    useState(initial: unknown) {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [value, () => {}];
    },
    useEffect() {},
    useMemo<T>(factory: () => T) {
      return factory();
    },
  };

  const noopComponent = () => null;
  const supabaseStub = {
    functions: { invoke: async () => ({ data: {}, error: null }) },
    from: () => ({
      select: async () => ({ data: [], error: null }),
      insert: async () => ({ data: null, error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel() {},
  };

  const customRequire = (specifier: string) => {
    if (specifier === "react") {
      return reactStub;
    }
    if (specifier === "react/jsx-runtime") {
      return requireFn(specifier);
    }
    if (specifier === "@/components/CredentialSetup") {
      return { CredentialSetup: noopComponent };
    }
    if (specifier === "@/components/QRCodeScanner") {
      return { QRCodeScanner: noopComponent };
    }
    if (specifier === "@/components/ChatSidebar") {
      return { ChatSidebar: noopComponent };
    }
    if (specifier === "@/components/ChatArea") {
      return { ChatArea: noopComponent };
    }
    if (specifier === "@/components/AssignChatDialog") {
      return { AssignChatDialog: noopComponent };
    }
    if (specifier === "@/hooks/use-toast") {
      return { useToast: () => ({ toast: () => {} }) };
    }
    if (specifier === "@/integrations/supabase/client") {
      return { supabase: supabaseStub };
    }
    if (specifier === "@/lib/message-order") {
      return {
        mergeFetchedMessages: (previous: unknown[]) => previous,
        normalizeFetchedMessages: (messages: unknown[]) => messages,
      };
    }
    if (specifier === "@/lib/message-pagination") {
      return {
        createInitialMessagePagination: () => ({ limit: 0, offset: 0, hasMore: false }),
        applyMessagePaginationUpdate: () => ({ limit: 0, offset: 0, hasMore: false }),
      };
    }
    if (specifier.startsWith("@/")) {
      const resolved = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
      return requireFn(fileURLToPath(resolved));
    }
    return requireFn(specifier);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    window: undefined,
    document: undefined,
  });

  new vm.Script(outputText, { filename: modulePath }).runInContext(context);

  return module.exports;
};

test("envio otimista seguido de evento realtime mantém apenas uma mensagem", () => {
  const indexModule = loadIndexModule() as { mapApiMessage: (message: any) => any };
  const { mapApiMessage } = indexModule;

  const optimisticMessage = {
    id: "wamid.HBgLNDEyMw==",
    chatId: "chat-1",
    content: "Olá",
    timestamp: "10:00",
    from: "me" as const,
  };

  const realtimePayload = {
    id: "row-123",
    chat_id: "chat-1",
    wa_message_id: "wamid.HBgLNDEyMw==",
    content: "Olá",
    message_timestamp: Date.now(),
    from_me: true,
  };

  const mappedRealtime = mapApiMessage(realtimePayload);

  const result = (() => {
    const previous = [optimisticMessage];
    if (previous.some(message => message.id === mappedRealtime.id)) {
      return previous;
    }
    return [...previous, mappedRealtime];
  })();

  assert.equal(result.length, 1);
  assert.equal(result[0].id, optimisticMessage.id);
});

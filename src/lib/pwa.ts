export function registerServiceWorker(): void {
  const metaEnv = import.meta as ImportMeta & { env?: { PROD?: boolean } };
  const isProduction = typeof metaEnv.env?.PROD === "boolean" ? metaEnv.env.PROD : process.env.NODE_ENV === "production";
  if (isProduction && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
}

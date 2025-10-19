import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modulePath = fileURLToPath(new URL("../src/lib/utils.ts", import.meta.url));
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

const { extractCurlUrls } = module.exports;

const sample = String.raw`curl 'https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/' \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  -H 'accept-language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' \
  -H 'cache-control: max-age=0' \
  -H 'priority: u=0, i' \
  -H 'referer: https://easypanel02.quantumtecnologia.com.br/' \
  -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'sec-fetch-dest: document' \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-site: cross-site' \
  -H 'sec-fetch-user: ?1' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' ;
curl 'https://fonts.googleapis.com/css?family=Nunito' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'referer: https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
  -H 'sec-ch-ua-mobile: ?0' ;
curl 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshdTQ3jw.woff2' -H 'referer;' ;
curl 'https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/favicon.ico' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'referer: https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
  -H 'sec-ch-ua-mobile: ?0' ;
curl 'chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/icom.html?t=MzQ2NDc0Mzk2MTA3MTEzMjpbWyJuYW1lIiwiaWZyYW1lLWNvbSJdLFsidGFiSWQiLDEwNTYwMjcyMF1d' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' ;
curl 'chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/injected-scripts/icom.js' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
  -H 'referer;' ;
curl 'chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/iui.html?t=NDkwMTA0ODI2MjIxMjk4OltbIm5hbWUiLCJpZnJhbWUtamFtLXVpIl0sWyJ0YWJJZCIsMTA1NjAyNzIwXV0' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'sec-ch-ua: "Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' ;
curl 'chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/assets/index.css' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
  -H 'referer;' ;
curl 'chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/injected-scripts/iui.js' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' \
  -H 'referer;'`;

test("extractCurlUrls identifica URLs distintas na ordem encontrada", () => {
  const urls = [...extractCurlUrls(sample)];
  assert.deepEqual(urls, [
    "https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/",
    "https://fonts.googleapis.com/css?family=Nunito",
    "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshdTQ3jw.woff2",
    "https://quantumtecnologia-qchat-quantum.3a2ucf.easypanel.host/favicon.ico",
    "chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/icom.html?t=MzQ2NDc0Mzk2MTA3MTEzMjpbWyJuYW1lIiwiaWZyYW1lLWNvbSJdLFsidGFiSWQiLDEwNTYwMjcyMF1d",
    "chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/injected-scripts/icom.js",
    "chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/iui.html?t=NDkwMTA0ODI2MjIxMjk4OltbIm5hbWUiLCJpZnJhbWUtamFtLXVpIl0sWyJ0YWJJZCIsMTA1NjAyNzIwXV0",
    "chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/assets/index.css",
    "chrome-extension://iohjgamcilhbgmhbnllfolmkmmekfmci/injected-scripts/iui.js",
  ]);
});

import { readFile } from "node:fs/promises";
import { access, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const tryExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

async function resolveAlias(specifier) {
  const basePath = join(process.cwd(), "src", specifier.slice(2));

  return resolveWithExtensions(basePath);
}

async function resolveWithExtensions(basePath) {
  for (const ext of tryExtensions) {
    const candidate = ext ? `${basePath}${ext}` : basePath;
    try {
      await access(candidate);
      return pathToFileURL(candidate).href;
    } catch {
      // ignore
    }
  }

  try {
    const directory = await stat(basePath);
    if (directory.isDirectory()) {
      for (const ext of tryExtensions.slice(1)) {
        const candidate = join(basePath, `index${ext}`);
        try {
          await access(candidate);
          return pathToFileURL(candidate).href;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = await resolveAlias(specifier);
    if (resolved) {
      return defaultResolve(resolved, context, defaultResolve);
    }
  }

  if (specifier === "@testing-library/react") {
    const basePath = join(process.cwd(), "tests", "test-utils", "testing-library-react");
    const resolved = await resolveWithExtensions(basePath);
    if (resolved) {
      return { url: resolved, shortCircuit: true };
    }
  }

  if (specifier.startsWith(".")) {
    const parentUrl = context.parentURL;
    if (parentUrl) {
      const parentPath = fileURLToPath(parentUrl);
      const baseDir = dirname(parentPath);
      const candidate = join(baseDir, specifier);
      const resolved = await resolveWithExtensions(candidate);
      if (resolved) {
        return { url: resolved, shortCircuit: true };
      }
    }
  }

  if ((specifier.endsWith(".ts") || specifier.endsWith(".tsx")) && !specifier.startsWith("file:")) {
    const url = pathToFileURL(join(process.cwd(), specifier));
    return defaultResolve(url.href, context, defaultResolve);
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2020,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        esModuleInterop: true,
        sourceMap: false,
      },
      fileName: filePath,
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }

  return defaultLoad(url, context, defaultLoad);
}

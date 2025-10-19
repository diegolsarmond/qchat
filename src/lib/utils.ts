import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractCurlUrls(input: string) {
  const regex = /curl\s+['"]?((?:https?|chrome-extension):\/\/[^'"\s\\]+)/gi;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of input.matchAll(regex)) {
    const raw = match[1].replace(/[\\;]+$/, "");
    if (!seen.has(raw)) {
      seen.add(raw);
      result.push(raw);
    }
  }

  return result;
}

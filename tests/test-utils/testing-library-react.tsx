import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

type RecordedElement = {
  type: string;
  props: Record<string, any>;
};

type QueryFn = (text: string) => TestingLibraryElement;

type RenderResult = {
  container: { markup: string };
  getByLabelText: QueryFn;
  getByTestId: QueryFn;
};

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

class TestingLibraryElement {
  private entry: RecordedElement;

  constructor(entry: RecordedElement) {
    this.entry = entry;
  }

  get props() {
    return this.entry.props;
  }
}

const createEvent = (type: string, element: TestingLibraryElement, init?: any) => {
  const target = init?.target ?? {};
  return {
    ...init,
    type,
    target,
    currentTarget: target,
    preventDefault: () => {},
    stopPropagation: () => {},
  };
};

export const fireEvent = {
  async change(element: TestingLibraryElement, init?: any) {
    const handler = element.props?.onChange;
    if (!handler) return;
    return handler(createEvent("change", element, init));
  },
  async click(element: TestingLibraryElement, init?: any) {
    const handler = element.props?.onClick;
    if (!handler) return;
    return handler(createEvent("click", element, init));
  },
};

const matchText = (value: unknown, expected: string) => {
  if (typeof value !== "string") return false;
  return normalizeText(value) === normalizeText(expected);
};

const createQueries = (elements: RecordedElement[]) => {
  const findElement = (predicate: (element: RecordedElement) => boolean) => {
    const entry = elements.find(predicate);
    if (!entry) {
      throw new Error("Elemento não encontrado");
    }
    return new TestingLibraryElement(entry);
  };

  const getByLabelText: QueryFn = (text) => {
    return findElement((element) => matchText(element.props["aria-label"], text));
  };

  const getByTestId: QueryFn = (testId) => {
    return findElement((element) => element.props["data-testid"] === testId);
  };

  return { getByLabelText, getByTestId };
};

let lastRender: RenderResult | null = null;

export const render = (ui: React.ReactElement): RenderResult => {
  const recordedElements: RecordedElement[] = [];
  const originalCreateElement = React.createElement;

  React.createElement = function patched(type: any, props: any, ...children: any[]) {
    if (typeof type === "string" && props) {
      recordedElements.push({ type, props });
    }
    return originalCreateElement(type, props, ...children);
  } as typeof React.createElement;

  try {
    const markup = renderToStaticMarkup(ui);
    const queries = createQueries(recordedElements);
    lastRender = { container: { markup }, ...queries };
    return lastRender;
  } finally {
    React.createElement = originalCreateElement;
  }
};

export const screen = new Proxy(
  {},
  {
    get(_target, property) {
      if (!lastRender) {
        throw new Error("Nenhum render foi executado");
      }
      const value = (lastRender as any)[property];
      if (typeof value === "function") {
        return value.bind(lastRender);
      }
      return value;
    },
  },
) as RenderResult;

export const cleanup = () => {
  lastRender = null;
};

interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

export const waitFor = async (callback: () => void, options: WaitForOptions = {}) => {
  const timeout = options.timeout ?? 1000;
  const interval = options.interval ?? 50;
  const endTime = Date.now() + timeout;
  let lastError: unknown;

  while (Date.now() < endTime) {
    try {
      callback();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw lastError ?? new Error("Condição não satisfeita no waitFor");
};

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import "../i18n";
import { routes } from "../routes";

/** Renders the real app routes at `path`, with a fresh query cache. */
export function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** A controllable stand-in for EventSource (jsdom doesn't have one). */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  /** Delivers a server-sent message to the page. */
  emit(type: string, data: unknown = {}) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  static install() {
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  }

  static latest(): FakeEventSource {
    const source = FakeEventSource.instances.filter((s) => !s.closed).at(-1);
    if (!source) throw new Error("No open EventSource");
    return source;
  }
}

/** Replaces fetch with a handler that returns JSON responses. */
export function mockFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body?: unknown },
) {
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { status, body } = handler(String(input), init);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  globalThis.fetch = fetchMock as typeof fetch;
}

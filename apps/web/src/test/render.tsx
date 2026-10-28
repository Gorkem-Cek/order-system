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

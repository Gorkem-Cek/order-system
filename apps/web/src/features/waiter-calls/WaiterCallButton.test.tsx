import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { menuFixture } from "../../test/menu-fixture";
import { mockFetch, renderRoute } from "../../test/render";

const TOKEN = "TableToken_1234567890";
let callResponse: { status: number; body?: unknown };
let calls: number;

beforeEach(() => {
  localStorage.clear();
  calls = 0;
  callResponse = { status: 201, body: { cooldownSeconds: 60 } };
  mockFetch((url, init) => {
    if (url === `/api/menu/${TOKEN}`) return { status: 200, body: menuFixture };
    if (url === `/api/menu/${TOKEN}/waiter-call` && init?.method === "POST") {
      calls += 1;
      return callResponse;
    }
    return { status: 404 };
  });
});

async function openMenu() {
  const user = userEvent.setup();
  const view = renderRoute(`/m/${TOKEN}`);
  await screen.findByRole("heading", { name: "Demo Kafe" });
  return { user, ...view };
}

describe("call waiter button", () => {
  it("calls the waiter, confirms it and starts the cooldown", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Garson çağır" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Garson çağrıldı!");
    const button = screen.getByRole("button", { name: /Tekrar çağırmak için 60 saniye/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("60 sn");
    expect(calls).toBe(1);
  });

  it("keeps the cooldown after a reload", async () => {
    const { user, unmount } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Garson çağır" }));
    await screen.findByRole("status");
    unmount();

    await openMenu();
    expect(screen.getByRole("button", { name: /Tekrar çağırmak için/ })).toBeDisabled();
  });

  it("uses the server's remaining time when the table already called", async () => {
    callResponse = {
      status: 429,
      body: {
        error: {
          code: "WAITER_CALL_COOLDOWN",
          message: "x",
          details: { retryAfterSeconds: 25 },
        },
      },
    };
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Garson çağır" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Garson az önce çağrıldı");
    expect(screen.getByRole("button", { name: /25 saniye/ })).toBeDisabled();
  });

  it("explains a failure and stays usable", async () => {
    callResponse = { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "x" } } };
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Garson çağır" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Garson çağrılamadı");
    expect(screen.getByRole("button", { name: "Garson çağır" })).toBeEnabled();
  });
});

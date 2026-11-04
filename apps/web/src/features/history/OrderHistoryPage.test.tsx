import {
  ORDER_HISTORY_PAGE_SIZE,
  type Order,
  type SessionUser,
  type StaffCafe,
} from "@siparis/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource, mockFetch, renderRoute } from "../../test/render";

const cafe: StaffCafe = {
  id: "cmcaf00000000000000000001",
  name: "Demo Kafe",
  slug: "demo-kafe",
  logoUrl: null,
  coverUrl: null,
  primaryColor: "#7c4a2d",
  isActive: true,
};
const user: SessionUser = {
  id: "cmusr00000000000000000001",
  email: "demo@siparis.local",
  name: "Demo Kafe",
  role: "STAFF",
  cafeId: cafe.id,
};

const order = (n: number, status: Order["status"] = "SERVED"): Order => ({
  id: `cmord${String(n).padStart(20, "0")}`,
  orderNumber: n,
  tableName: "Bahçe 2",
  status,
  note: n === 1 ? "Hepsi birlikte" : null,
  totalKurus: 20000,
  createdAt: "2026-11-04T09:15:00.000Z",
  updatedAt: "2026-11-04T09:20:00.000Z",
  items: [
    {
      id: `cmitm${String(n).padStart(20, "0")}`,
      productName: "Latte",
      unitPriceKurus: 10000,
      quantity: 2,
      note: "Şekersiz",
      selectedOptions: [{ group: "Boyut", option: "Büyük", priceDeltaKurus: 4000 }],
    },
  ],
});

let requests: URLSearchParams[];
let total: number;

beforeEach(() => {
  // Only Date is faked, so user-event's timers keep working. 10:00 in Istanbul.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T07:00:00Z"));
  localStorage.clear();
  FakeEventSource.install();
  requests = [];
  total = 2;

  mockFetch((url) => {
    if (url === "/api/auth/me") return { status: 200, body: user };
    if (url === "/api/staff/cafe") return { status: 200, body: cafe };
    if (url.startsWith("/api/staff/orders/history?")) {
      const params = new URLSearchParams(url.split("?")[1]);
      requests.push(params);
      const page = Number(params.get("page"));
      const count = Math.max(0, Math.min(ORDER_HISTORY_PAGE_SIZE, total - (page - 1) * 50));
      const orders = Array.from({ length: count }, (_, i) =>
        order(total - (page - 1) * 50 - i, i === 1 ? "CANCELLED" : "SERVED"),
      );
      return {
        status: 200,
        body: { orders, page, pageSize: ORDER_HISTORY_PAGE_SIZE, total },
      };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

afterEach(() => vi.useRealTimers());

async function openHistory(path = "/staff/history") {
  const u = userEvent.setup();
  renderRoute(path);
  await screen.findByRole("heading", { name: "Sipariş geçmişi", level: 1 });
  return u;
}

const lastRequest = () => Object.fromEntries(requests.at(-1) ?? []);

describe("OrderHistoryPage", () => {
  it("shows today's orders by default, newest first", async () => {
    await openHistory();
    expect(await screen.findByText("2 siparişten 1–2 gösteriliyor")).toBeInTheDocument();
    expect(lastRequest()).toEqual({ from: "2026-11-04", to: "2026-11-04", page: "1" });
    expect(screen.getByRole("button", { name: "Bugün" })).toHaveAttribute("aria-pressed", "true");

    const rows = screen.getAllByRole("listitem").filter((li) => li.dataset["status"]);
    expect(rows.map((r) => within(r).getByText(/^#\d+$/).textContent)).toEqual(["#2", "#1"]);
    expect(within(rows[0] as HTMLElement).getByText("Servis edildi")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("İptal edildi")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("2× Latte")).toBeInTheDocument();
  });

  it("opens an order to show its items, options and notes", async () => {
    const u = await openHistory();
    await u.click(await screen.findByText("#1"));
    const row = screen.getByText("#1").closest("li") as HTMLElement;
    expect(within(row).getByText(/\(Büyük\)/)).toBeVisible();
    expect(within(row).getByText(/“Şekersiz”/)).toBeVisible();
    expect(within(row).getByText("Hepsi birlikte")).toBeVisible();
  });

  it("filters by quick range and status, and keeps the filter in the URL", async () => {
    const u = await openHistory();
    await screen.findByText("#2");

    await u.click(screen.getByRole("button", { name: "Son 7 gün" }));
    await waitFor(() =>
      expect(lastRequest()).toEqual({ from: "2026-10-29", to: "2026-11-04", page: "1" }),
    );
    await u.selectOptions(screen.getByLabelText("Durum"), "CANCELLED");
    await waitFor(() => expect(lastRequest()).toMatchObject({ status: "CANCELLED" }));

    await u.click(screen.getByRole("button", { name: "Dün" }));
    await waitFor(() =>
      expect(lastRequest()).toEqual({
        from: "2026-11-03",
        to: "2026-11-03",
        status: "CANCELLED",
        page: "1",
      }),
    );
  });

  it("reads the filter from the URL", async () => {
    await openHistory("/staff/history?from=2026-10-01&to=2026-10-31&status=SERVED");
    await screen.findByText("#2");
    expect(lastRequest()).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      status: "SERVED",
      page: "1",
    });
    expect(screen.getByLabelText("Başlangıç")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Durum")).toHaveValue("SERVED");
  });

  it("pages through many orders", async () => {
    total = 120;
    const u = await openHistory();
    expect(await screen.findByText("120 siparişten 1–50 gösteriliyor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Önceki/ })).toBeDisabled();

    await u.click(screen.getByRole("button", { name: /Sonraki/ }));
    expect(await screen.findByText("120 siparişten 51–100 gösteriliyor")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Sonraki/ }));
    expect(await screen.findByText("120 siparişten 101–120 gösteriliyor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sonraki/ })).toBeDisabled();
    expect(lastRequest()).toMatchObject({ page: "3" });
  });

  it("says when there are no orders", async () => {
    total = 0;
    await openHistory();
    expect(await screen.findByText("Bu tarihlerde sipariş yok.")).toBeInTheDocument();
  });
});

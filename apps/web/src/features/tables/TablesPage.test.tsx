import type { SessionUser, StaffCafe, StaffTable } from "@siparis/shared";
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

let tables: StaffTable[];
let calls: { method: string; url: string; body?: Record<string, unknown> }[];
let counter: number;

const makeTable = (name: string): StaffTable => {
  const n = String(++counter).padStart(20, "0");
  const qrToken = `token${n}`;
  return {
    id: `cmtab${n}`,
    name,
    qrToken,
    menuUrl: `https://siparis.example/m/${qrToken}`,
    qrSvg: `<svg xmlns="http://www.w3.org/2000/svg"><title>${qrToken}</title></svg>`,
  };
};

/** A tiny in-memory version of the staff tables API. */
beforeEach(() => {
  localStorage.clear();
  FakeEventSource.install();
  counter = 0;
  tables = [makeTable("Masa 1"), makeTable("Masa 2")];
  calls = [];

  mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (method !== "GET") calls.push({ method, url, body });

    if (url === "/api/auth/me") return { status: 200, body: user };
    if (url === "/api/staff/cafe") return { status: 200, body: cafe };
    if (url === "/api/staff/tables" && method === "GET") return { status: 200, body: { tables } };
    if (url === "/api/staff/tables" && method === "POST") {
      if (tables.some((t) => t.name.toLowerCase() === body.name.toLowerCase())) {
        return {
          status: 409,
          body: { error: { code: "CONFLICT", message: "x", details: { field: "name" } } },
        };
      }
      const table = makeTable(body.name);
      tables.push(table);
      return { status: 201, body: table };
    }
    const qr = url.match(/^\/api\/staff\/tables\/(\w+)\/qr$/);
    if (qr) {
      const index = tables.findIndex((t) => t.id === qr[1]);
      const fresh = makeTable("x");
      tables[index] = { ...fresh, id: qr[1] ?? "", name: tables[index]?.name ?? "" };
      return { status: 200, body: tables[index] };
    }
    const one = url.match(/^\/api\/staff\/tables\/(\w+)$/);
    if (one && method === "PATCH") {
      const table = tables.find((t) => t.id === one[1]) as StaffTable;
      table.name = body.name;
      return { status: 200, body: table };
    }
    if (one && method === "DELETE") {
      tables = tables.filter((t) => t.id !== one[1]);
      return { status: 204 };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

afterEach(() => vi.restoreAllMocks());

async function openTables() {
  const u = userEvent.setup();
  renderRoute("/staff/tables");
  await screen.findByRole("heading", { name: "Masalar", level: 1 });
  return u;
}

const card = (name: string) => screen.getByRole("listitem", { name });

describe("TablesPage", () => {
  it("shows each table with its QR code and a link to its menu", async () => {
    await openTables();
    const masa1 = card("Masa 1");
    const qr = within(masa1).getByRole("img", { name: "Masa 1 QR kodu" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(within(masa1).getByRole("link", { name: "Menüyü aç: Masa 1" })).toHaveAttribute(
      "href",
      tables[0]?.menuUrl,
    );
    expect(within(masa1).getByRole("link", { name: "Yazdır: Masa 1" })).toHaveAttribute(
      "href",
      `/staff/tables/print?table=${tables[0]?.id}`,
    );
    expect(screen.getByRole("link", { name: /Tüm QR kodları yazdır/ })).toBeInTheDocument();
  });

  it("adds a table", async () => {
    const u = await openTables();
    await u.type(screen.getByLabelText("Yeni masa adı"), "  Bahçe 1 ");
    await u.click(screen.getByRole("button", { name: /Masa ekle/ }));

    expect(await screen.findByRole("listitem", { name: "Bahçe 1" })).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: "POST",
      url: "/api/staff/tables",
      body: { name: "Bahçe 1" },
    });
    expect(screen.getByLabelText("Yeni masa adı")).toHaveValue("");
  });

  it("explains a duplicate name", async () => {
    const u = await openTables();
    await u.type(screen.getByLabelText("Yeni masa adı"), "masa 1");
    await u.click(screen.getByRole("button", { name: /Masa ekle/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu isimde bir masa zaten var.");
  });

  it("renames a table", async () => {
    const u = await openTables();
    await u.click(within(card("Masa 2")).getByRole("button", { name: "Yeniden adlandır: Masa 2" }));
    const input = screen.getByLabelText("Masa adı");
    await u.clear(input);
    await u.type(input, "Teras 2{Enter}");

    expect(await screen.findByRole("listitem", { name: "Teras 2" })).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: "PATCH",
      url: `/api/staff/tables/${tables[1]?.id}`,
      body: { name: "Teras 2" },
    });
  });

  it("creates a new QR code after confirming", async () => {
    const u = await openTables();
    const before = within(card("Masa 1")).getByRole("img").getAttribute("src");
    await u.click(within(card("Masa 1")).getByRole("button", { name: "Yeni QR: Masa 1" }));
    expect(screen.getByText(/Eski QR kod hemen çalışmaz hale gelir/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Evet, yeni QR oluştur" }));

    await waitFor(() =>
      expect(within(card("Masa 1")).getByRole("img").getAttribute("src")).not.toBe(before),
    );
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST /api/staff/tables/${tables[0]?.id}/qr`,
    ]);
  });

  it("deletes a table after confirming, and can be cancelled", async () => {
    const u = await openTables();
    const id = tables[1]?.id;
    await u.click(within(card("Masa 2")).getByRole("button", { name: "Sil: Masa 2" }));
    await u.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(calls).toEqual([]);

    await u.click(within(card("Masa 2")).getByRole("button", { name: "Sil: Masa 2" }));
    await u.click(screen.getByRole("button", { name: "Evet, sil" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Masa 2" })).toBeNull());
    expect(calls).toEqual([{ method: "DELETE", url: `/api/staff/tables/${id}` }]);
  });

  it("shows an empty state", async () => {
    tables = [];
    await openTables();
    expect(screen.getByText(/Henüz masa yok/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tüm QR kodları yazdır/ })).toBeNull();
  });
});

describe("QrPrintPage", () => {
  it("prints a card for every table, in both languages", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const u = userEvent.setup();
    renderRoute("/staff/tables/print");

    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Masa 1", "Masa 2"]);
    const first = cards[0] as HTMLElement;
    expect(within(first).getByText("Demo Kafe")).toBeInTheDocument();
    expect(within(first).getByRole("img", { name: "Masa 1 QR kodu" })).toBeInTheDocument();
    expect(within(first).getByText("Menü ve sipariş için okutun")).toBeInTheDocument();
    expect(within(first).getByText("Scan for the menu and to order")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /Yazdır/ }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("prints just one table", async () => {
    renderRoute(`/staff/tables/print?table=${tables[1]?.id}`);
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Masa 2"]);
  });

  it("says when the table no longer exists", async () => {
    renderRoute("/staff/tables/print?table=cmtab_gone");
    expect(await screen.findByText("Bu masa bulunamadı.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yazdır/ })).toBeDisabled();
  });
});

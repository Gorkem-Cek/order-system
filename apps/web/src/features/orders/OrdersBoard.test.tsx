import { CAFE_ID_HEADER, type Order, type SessionUser, type StaffCafe } from "@siparis/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
const staffUser: SessionUser = {
  id: "cmusr00000000000000000001",
  email: "demo@siparis.local",
  name: "Demo Kafe",
  role: "STAFF",
  cafeId: cafe.id,
};
const adminUser: SessionUser = { ...staffUser, role: "SUPER_ADMIN", cafeId: null };

let orderCounter = 0;
function makeOrder(overrides: Partial<Order> = {}): Order {
  orderCounter += 1;
  const n = String(orderCounter).padStart(4, "0");
  return {
    id: `cmord000000000000000${n}0`,
    orderNumber: orderCounter,
    tableName: "Masa 3",
    status: "NEW",
    note: null,
    totalKurus: 26500,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: `cmitm000000000000000${n}0`,
        productName: "Latte",
        unitPriceKurus: 26500,
        quantity: 1,
        note: "Az köpük",
        selectedOptions: [
          { group: "Boyut", option: "Büyük", priceDeltaKurus: 4000 },
          { group: "Süt", option: "Yulaf sütü", priceDeltaKurus: 3000 },
        ],
      },
    ],
    ...overrides,
  };
}

type Request = { url: string; method: string; headers: Record<string, string>; body?: unknown };

let session: SessionUser | null;
let orders: Order[];
let requests: Request[];
let patchResponse: (order: Order, status: string) => { status: number; body: unknown };

beforeEach(() => {
  localStorage.clear();
  FakeEventSource.install();
  orderCounter = 0;
  session = staffUser;
  orders = [];
  requests = [];
  patchResponse = (order, status) => ({ status: 200, body: { ...order, status } });

  mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, headers, body });

    if (url === "/api/auth/me") {
      return session ? { status: 200, body: session } : { status: 401, body: unauthorized };
    }
    if (url === "/api/auth/login") {
      if (body.password !== "demo1234") {
        return { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "x" } } };
      }
      session = staffUser;
      return { status: 200, body: staffUser };
    }
    if (url === "/api/auth/logout") {
      session = null;
      return { status: 204 };
    }
    if (url === "/api/admin/cafes") {
      return {
        status: 200,
        body: {
          cafes: [
            {
              id: cafe.id,
              name: cafe.name,
              slug: cafe.slug,
              isActive: true,
              createdAt: new Date().toISOString(),
              loginEmail: staffUser.email,
            },
          ],
        },
      };
    }
    if (url === "/api/staff/cafe") return { status: 200, body: cafe };
    if (url === "/api/staff/orders") return { status: 200, body: { orders } };
    const patch = url.match(/^\/api\/staff\/orders\/(\w+)\/status$/);
    if (patch && method === "PATCH") {
      const order = orders.find((o) => o.id === patch[1]);
      if (!order) return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
      const result = patchResponse(order, body.status);
      if (result.status === 200) {
        orders = orders.map((o) => (o.id === order.id ? (result.body as Order) : o));
      }
      return result;
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

const unauthorized = { error: { code: "UNAUTHORIZED", message: "Not logged in" } };

async function openBoard() {
  const user = userEvent.setup();
  renderRoute("/staff");
  await screen.findByRole("heading", { name: "Siparişler" });
  return user;
}

const column = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });

describe("staff login", () => {
  it("sends logged-out users to the login page and back after signing in", async () => {
    session = null;
    const user = userEvent.setup();
    renderRoute("/staff");
    expect(await screen.findByRole("heading", { name: "Personel girişi" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("E-posta"), "demo@siparis.local");
    await user.type(screen.getByLabelText("Şifre"), "wrong");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta ya da şifre hatalı.");

    await user.clear(screen.getByLabelText("Şifre"));
    await user.type(screen.getByLabelText("Şifre"), "demo1234");
    await user.click(screen.getByRole("button", { name: "Giriş yap" }));
    expect(await screen.findByRole("heading", { name: "Siparişler" })).toBeInTheDocument();
    expect(screen.getByText("Demo Kafe")).toBeInTheDocument();
  });

  it("signs out", async () => {
    const user = await openBoard();
    await user.click(screen.getByRole("button", { name: "Çıkış yap" }));
    expect(await screen.findByRole("heading", { name: "Personel girişi" })).toBeInTheDocument();
  });
});

describe("orders board", () => {
  it("shows new and preparing orders with their details", async () => {
    orders = [makeOrder({ note: "Hepsi birlikte" }), makeOrder({ status: "PREPARING" })];
    await openBoard();

    const newColumn = column("Yeni");
    const card = within(newColumn).getByRole("article", { name: "#1" });
    expect(within(card).getByText("Masa 3")).toBeInTheDocument();
    expect(within(card).getByText("Büyük, Yulaf sütü")).toBeInTheDocument();
    expect(within(card).getByText("“Az köpük”")).toBeInTheDocument();
    expect(within(card).getByText("Hepsi birlikte")).toBeInTheDocument();
    expect(within(card).getByText("₺265,00")).toBeInTheDocument();
    expect(within(card).getByText(/5 dk önce/)).toBeInTheDocument();
    expect(within(column("Hazırlanıyor")).getByRole("article", { name: "#2" })).toBeInTheDocument();
  });

  it("moves an order to preparing and then off the board when served", async () => {
    orders = [makeOrder()];
    const user = await openBoard();

    await user.click(within(column("Yeni")).getByRole("button", { name: "Hazırlamaya başla" }));
    const preparing = await within(column("Hazırlanıyor")).findByRole("article", { name: "#1" });
    expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "PREPARING" });

    await user.click(within(preparing).getByRole("button", { name: "Servis edildi" }));
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "#1" })).not.toBeInTheDocument(),
    );
  });

  it("asks before cancelling", async () => {
    orders = [makeOrder()];
    const user = await openBoard();

    await user.click(screen.getByRole("button", { name: "İptal et" }));
    const dialog = screen.getByRole("dialog", { name: "Sipariş #1 iptal edilsin mi?" });
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);

    await user.click(screen.getByRole("button", { name: "İptal et" }));
    await user.click(screen.getByRole("button", { name: "Evet, iptal et" }));
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "#1" })).not.toBeInTheDocument(),
    );
    expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "CANCELLED" });
  });

  it("adds orders that arrive live and highlights them", async () => {
    await openBoard();
    const stream = FakeEventSource.latest();
    expect(stream.url).toBe("/api/staff/events");
    act(() => stream.emit("ready"));
    expect(await screen.findByText("Canlı")).toBeInTheDocument();
    expect(within(column("Yeni")).getByText("Yeni sipariş yok.")).toBeInTheDocument();

    const order = makeOrder({ createdAt: new Date().toISOString() });
    act(() => stream.emit("order.created", { type: "order.created", order }));
    const card = within(column("Yeni")).getByRole("article", { name: "#1" });
    expect(within(card).getByText("Yeni", { selector: "span" })).toBeInTheDocument();
    expect(within(card).getByText(/az önce/)).toBeInTheDocument();
    expect(document.title).toBe("(1) Siparişler · Demo Kafe");

    // Another screen moved it on.
    act(() =>
      stream.emit("order.updated", {
        type: "order.updated",
        order: { ...order, status: "SERVED" },
      }),
    );
    // Query-cache updates reach components on the next tick.
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "#1" })).not.toBeInTheDocument(),
    );
  });

  it("refetches after reconnecting and shows when the connection drops", async () => {
    await openBoard();
    const stream = FakeEventSource.latest();
    act(() => stream.onerror?.(new Event("error")));
    expect(screen.getByRole("status")).toHaveTextContent("Bağlantı koptu");

    orders = [makeOrder()];
    act(() => stream.emit("ready"));
    expect(await within(column("Yeni")).findByRole("article", { name: "#1" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Canlı");
  });

  it("explains when another screen already changed the order", async () => {
    orders = [makeOrder()];
    patchResponse = () => ({
      status: 409,
      body: { error: { code: "INVALID_STATUS_TRANSITION", message: "x" } },
    });
    const user = await openBoard();
    await user.click(screen.getByRole("button", { name: "Hazırlamaya başla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("başka bir ekrandan");
  });
});

describe("super-admin", () => {
  it("picks a café and acts on it with the café id", async () => {
    session = adminUser;
    orders = [makeOrder()];
    const user = userEvent.setup();
    renderRoute("/staff");

    await user.click(await screen.findByRole("button", { name: /Demo Kafe/ }));
    expect(await screen.findByRole("heading", { name: "Siparişler" })).toBeInTheDocument();

    const staffCalls = requests.filter((r) => r.url.startsWith("/api/staff/"));
    expect(staffCalls.length).toBeGreaterThan(0);
    expect(staffCalls.every((r) => r.headers[CAFE_ID_HEADER] === cafe.id)).toBe(true);
    expect(FakeEventSource.latest().url).toBe(`/api/staff/events?cafeId=${cafe.id}`);

    await user.click(screen.getByRole("button", { name: "Kafe değiştir" }));
    expect(
      await screen.findByRole("heading", { name: "Hangi kafeyi açmak istiyorsunuz?" }),
    ).toBeInTheDocument();
  });
});

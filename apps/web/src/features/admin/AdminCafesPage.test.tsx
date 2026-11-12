import type { AdminCafe, SessionUser } from "@siparis/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeEventSource, mockFetch, renderRoute } from "../../test/render";

const admin: SessionUser = {
  id: "cmusr00000000000000000009",
  email: "admin@siparis.local",
  name: "Admin",
  role: "SUPER_ADMIN",
  cafeId: null,
};

let session: SessionUser | null;
let cafes: AdminCafe[];
let calls: { method: string; url: string; body?: Record<string, unknown> }[];
let counter: number;
type Payment = {
  mode: "SANDBOX" | "LIVE" | null;
  apiKeyEnding: string | null;
  address: string | null;
  city: string | null;
};
let payment: Payment;
let rejectKeys: boolean;

const makeCafe = (name: string, slug: string, isActive = true): AdminCafe => ({
  id: `cmcaf${String(++counter).padStart(20, "0")}`,
  name,
  slug,
  isActive,
  createdAt: "2026-10-28T10:00:00.000Z",
  loginEmail: `${slug}@example.com`,
  paymentMode: null,
});

beforeEach(() => {
  localStorage.clear();
  FakeEventSource.install();
  counter = 0;
  session = admin;
  cafes = [makeCafe("Demo Kafe", "demo-kafe"), makeCafe("Eski Kafe", "eski-kafe", false)];
  calls = [];
  payment = { mode: null, apiKeyEnding: null, address: null, city: null };
  rejectKeys = false;

  mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (method !== "GET") calls.push({ method, url, body });

    if (url === "/api/auth/me") {
      return session
        ? { status: 200, body: session }
        : { status: 401, body: { error: { code: "UNAUTHORIZED", message: "x" } } };
    }
    if (url === "/api/admin/cafes" && method === "GET") return { status: 200, body: { cafes } };
    if (url === "/api/admin/cafes" && method === "POST") {
      if (cafes.some((c) => c.slug === body.slug)) {
        return {
          status: 409,
          body: { error: { code: "CONFLICT", message: "x", details: { field: "slug" } } },
        };
      }
      const cafe = { ...makeCafe(body.name, body.slug), loginEmail: body.loginEmail };
      cafes = [cafe, ...cafes];
      return { status: 201, body: cafe };
    }
    const one = url.match(/^\/api\/admin\/cafes\/(\w+)$/);
    if (one && method === "PATCH") {
      const cafe = cafes.find((c) => c.id === one[1]) as AdminCafe;
      Object.assign(cafe, body);
      return { status: 200, body: cafe };
    }
    if (/^\/api\/admin\/cafes\/\w+\/password$/.test(url)) return { status: 204 };
    if (/^\/api\/admin\/cafes\/\w+\/payment$/.test(url) && method === "GET") {
      return { status: 200, body: payment };
    }
    if (/^\/api\/admin\/cafes\/\w+\/payment$/.test(url) && method === "PUT") {
      if (rejectKeys) {
        return { status: 400, body: { error: { code: "PAYMENT_KEYS_REJECTED", message: "x" } } };
      }
      payment = {
        mode: body.mode,
        apiKeyEnding: body.apiKey ? body.apiKey.slice(-4) : payment.apiKeyEnding,
        address: body.address,
        city: body.city,
      };
      return { status: 200, body: payment };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

async function openAdmin() {
  const u = userEvent.setup();
  renderRoute("/admin");
  await screen.findByRole("listitem", { name: "Demo Kafe" });
  return u;
}

const row = (name: string) => screen.getByRole("listitem", { name });

describe("AdminCafesPage", () => {
  it("lists cafés with their status and login", async () => {
    await openAdmin();
    expect(screen.getByRole("heading", { name: "Kafeler", level: 1 })).toBeInTheDocument();
    expect(row("Demo Kafe")).toHaveTextContent("Aktif");
    expect(row("Demo Kafe")).toHaveTextContent("demo-kafe@example.com");
    expect(row("Eski Kafe")).toHaveTextContent("Pasif");
  });

  it("opens a café's panel", async () => {
    const u = await openAdmin();
    await u.click(within(row("Demo Kafe")).getByRole("button", { name: "Paneli aç" }));
    expect(localStorage.getItem("siparis.actingCafe")).toBe(cafes[0]?.id);
  });

  it("creates a café with a suggested slug and password, then shows the login", async () => {
    const u = await openAdmin();
    await u.click(screen.getByRole("button", { name: /Yeni kafe/ }));
    const dialog = screen.getByRole("dialog");
    await u.type(within(dialog).getByLabelText("Kafe adı"), "Köşe Kahve");
    expect(within(dialog).getByLabelText("Kısa ad (adres)")).toHaveValue("kose-kahve");
    await u.type(within(dialog).getByLabelText("Giriş e-postası"), "kose@example.com");
    const password = (within(dialog).getByLabelText("Şifre") as HTMLInputElement).value;
    expect(password).toHaveLength(12);
    await u.click(within(dialog).getByRole("button", { name: "Kafeyi oluştur" }));

    expect(await screen.findByRole("heading", { name: "Kafe oluşturuldu" })).toBeInTheDocument();
    expect(screen.getByText("kose@example.com", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(password, { selector: "dd" })).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: "POST",
        url: "/api/admin/cafes",
        body: {
          name: "Köşe Kahve",
          slug: "kose-kahve",
          loginEmail: "kose@example.com",
          loginPassword: password,
        },
      },
    ]);
    await u.click(screen.getByRole("button", { name: "Tamam" }));
    expect(await screen.findByRole("listitem", { name: "Köşe Kahve" })).toBeInTheDocument();
  });

  it("shows field errors before sending and a taken slug from the server", async () => {
    const u = await openAdmin();
    await u.click(screen.getByRole("button", { name: /Yeni kafe/ }));
    const dialog = screen.getByRole("dialog");
    await u.type(within(dialog).getByLabelText("Kafe adı"), "K");
    await u.click(within(dialog).getByRole("button", { name: "Kafeyi oluştur" }));
    expect(within(dialog).getByText("Kafe adı 2–100 karakter olmalı.")).toBeInTheDocument();
    expect(within(dialog).getByText("Geçerli bir e-posta girin.")).toBeInTheDocument();
    expect(calls).toEqual([]);

    await u.clear(within(dialog).getByLabelText("Kafe adı"));
    await u.type(within(dialog).getByLabelText("Kafe adı"), "Demo Kafe");
    await u.type(within(dialog).getByLabelText("Giriş e-postası"), "yeni@example.com");
    await u.click(within(dialog).getByRole("button", { name: "Kafeyi oluştur" }));
    expect(await within(dialog).findByText("Bu kısa ad kullanılıyor.")).toBeInTheDocument();
  });

  it("resets a café's password and shows the new one", async () => {
    const u = await openAdmin();
    await u.click(within(row("Demo Kafe")).getByRole("button", { name: /Şifre sıfırla/ }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Yeni şifre");
    await u.clear(input);
    await u.type(input, "kisa");
    await u.click(within(dialog).getByRole("button", { name: "Şifre sıfırla" }));
    expect(within(dialog).getByText("Şifre en az 8 karakter olmalı.")).toBeInTheDocument();

    await u.click(within(dialog).getByRole("button", { name: "Yeni şifre üret" }));
    const password = (within(dialog).getByLabelText("Yeni şifre") as HTMLInputElement).value;
    await u.click(within(dialog).getByRole("button", { name: "Şifre sıfırla" }));
    expect(await screen.findByText(password, { selector: "dd" })).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: "POST",
        url: `/api/admin/cafes/${cafes[0]?.id}/password`,
        body: { newPassword: password },
      },
    ]);
  });

  it("deactivates after confirming and activates directly", async () => {
    const u = await openAdmin();
    await u.click(within(row("Demo Kafe")).getByRole("button", { name: /Pasifleştir/ }));
    expect(screen.getByText(/oturumu hemen kapanır/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Evet, pasifleştir" }));
    await waitFor(() => expect(row("Demo Kafe")).toHaveTextContent("Pasif"));

    await u.click(within(row("Eski Kafe")).getByRole("button", { name: /Aktifleştir/ }));
    await waitFor(() => expect(row("Eski Kafe")).toHaveTextContent("Aktif"));
    expect(calls.map((c) => [c.url.split("/").at(-1), c.body])).toEqual([
      [cafes[0]?.id, { isActive: false }],
      [cafes[1]?.id, { isActive: true }],
    ]);
  });

  it("is only for the super-admin", async () => {
    session = null;
    renderRoute("/admin");
    expect(await screen.findByRole("heading", { name: "Personel girişi" })).toBeInTheDocument();
  });

  it("sends café staff to their own panel", async () => {
    session = { ...admin, role: "STAFF", cafeId: "cmcaf00000000000000000001" };
    renderRoute("/admin");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Kafeler" })).toBeNull());
    expect(calls).toEqual([]);
  });

  describe("payment settings", () => {
    const sheet = () => screen.getByRole("dialog");
    const fill = async (u: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
      const input = within(sheet()).getByLabelText(label);
      await u.clear(input);
      if (value) await u.type(input, value);
    };
    const openPayment = async () => {
      const u = await openAdmin();
      await u.click(within(row("Demo Kafe")).getByRole("button", { name: /Ödeme ayarları/ }));
      await within(sheet()).findByLabelText("Kafe adresi");
      return u;
    };

    it("shows which cafés can take payments", async () => {
      cafes[1] = { ...(cafes[1] as AdminCafe), paymentMode: "SANDBOX" };
      await openAdmin();
      expect(row("Demo Kafe")).toHaveTextContent("iyzico bağlı değil");
      expect(row("Eski Kafe")).toHaveTextContent("iyzico: Test (sandbox)");
    });

    it("connects a café's iyzico test account", async () => {
      const u = await openPayment();
      expect(within(sheet()).getByText(/henüz bağlı değil/)).toBeInTheDocument();
      expect(within(sheet()).getByRole("radio", { name: /Test \(sandbox\)/ })).toBeChecked();

      await fill(u, "Kafe adresi", "Moda Cad. No 1");
      await fill(u, "Şehir", "İstanbul");
      await fill(u, "iyzico API anahtarı", "sandbox-abcdef1234");
      await fill(u, "iyzico güvenlik anahtarı (secret key)", "sandbox-secret-5678");
      await u.click(within(sheet()).getByRole("button", { name: "Kaydet" }));

      expect(await within(sheet()).findByRole("status")).toHaveTextContent("doğrulandı");
      expect(calls).toEqual([
        {
          method: "PUT",
          url: `/api/admin/cafes/${cafes[0]?.id}/payment`,
          body: {
            mode: "SANDBOX",
            address: "Moda Cad. No 1",
            city: "İstanbul",
            apiKey: "sandbox-abcdef1234",
            secretKey: "sandbox-secret-5678",
          },
        },
      ]);
      // The typed keys are cleared once saved; only the API key's ending is shown.
      expect(within(sheet()).getByLabelText("iyzico güvenlik anahtarı (secret key)")).toHaveValue(
        "",
      );
      expect(await within(sheet()).findByText(/…1234/)).toBeInTheDocument();
    });

    it("keeps the saved keys when they're left empty", async () => {
      payment = { mode: "SANDBOX", apiKeyEnding: "1234", address: "Moda Cad. 1", city: "İstanbul" };
      const u = await openPayment();
      expect(within(sheet()).getByText(/…1234/)).toBeInTheDocument();
      await fill(u, "Şehir", "İzmir");
      await u.click(within(sheet()).getByRole("button", { name: "Kaydet" }));
      await within(sheet()).findByRole("status");
      expect(calls[0]?.body).toEqual({ mode: "SANDBOX", address: "Moda Cad. 1", city: "İzmir" });
    });

    it("needs keys the first time, and explains keys iyzico rejected", async () => {
      rejectKeys = true;
      const u = await openPayment();
      await fill(u, "Kafe adresi", "Moda Cad. No 1");
      await fill(u, "Şehir", "İstanbul");
      await u.click(within(sheet()).getByRole("button", { name: "Kaydet" }));
      expect(within(sheet()).getByText(/birlikte girin/)).toBeInTheDocument();
      expect(calls).toEqual([]);

      await fill(u, "iyzico API anahtarı", "sandbox-wrong-0000");
      await fill(u, "iyzico güvenlik anahtarı (secret key)", "sandbox-wrong-1111");
      await u.click(within(sheet()).getByRole("button", { name: "Kaydet" }));
      expect(await within(sheet()).findByRole("alert")).toHaveTextContent("kabul etmedi");
    });
  });
});

import type { MenuCategory, MenuProduct, SessionUser, StaffCafe } from "@siparis/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ids, menuFixture } from "../../test/menu-fixture";
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

type Call = { method: string; url: string; body?: Record<string, unknown> };
let menu: MenuCategory[];
let calls: Call[];
let idCounter: number;

const findProduct = (id: string) =>
  menu.flatMap((c) => c.products).find((p) => p.id === id) as MenuProduct;

/** A tiny in-memory version of the staff menu API. */
beforeEach(() => {
  localStorage.clear();
  FakeEventSource.install();
  menu = structuredClone(menuFixture.categories);
  calls = [];
  idCounter = 0;
  const newId = () => `cmnew${String(++idCounter).padStart(20, "0")}`;

  mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method !== "GET") calls.push({ method, url, body });

    if (url === "/api/auth/me") return { status: 200, body: user };
    if (url === "/api/staff/cafe") return { status: 200, body: cafe };
    if (url === "/api/staff/menu") return { status: 200, body: { categories: menu } };
    if (url === "/api/staff/categories" && method === "POST") {
      const category = { id: newId(), name: body.name, products: [] };
      menu.push(category);
      return { status: 201, body: category };
    }
    if (url === "/api/staff/categories/order") {
      menu = (body.ids as string[]).map((id) => menu.find((c) => c.id === id) as MenuCategory);
      return { status: 204 };
    }
    const category = url.match(/^\/api\/staff\/categories\/(\w+)$/);
    if (category && method === "DELETE") {
      const target = menu.find((c) => c.id === category[1]);
      if (target?.products.length) {
        return { status: 409, body: { error: { code: "CONFLICT", message: "x" } } };
      }
      menu = menu.filter((c) => c.id !== category[1]);
      return { status: 204 };
    }
    const availability = url.match(/^\/api\/staff\/products\/(\w+)\/availability$/);
    if (availability) {
      const product = findProduct(availability[1] ?? "");
      product.isAvailable = body.isAvailable;
      return { status: 200, body: product };
    }
    if (url === "/api/staff/products" && method === "POST") {
      const product: MenuProduct = {
        id: newId(),
        name: body.name,
        description: body.description,
        priceKurus: body.priceKurus,
        imageUrl: null,
        isAvailable: body.isAvailable,
        optionGroups: body.optionGroups.map((g: MenuProduct["optionGroups"][number]) => ({
          ...g,
          id: newId(),
          options: g.options.map((o) => ({ ...o, id: newId() })),
        })),
      };
      menu.find((c) => c.id === body.categoryId)?.products.push(product);
      return { status: 201, body: product };
    }
    const product = url.match(/^\/api\/staff\/products\/(\w+)$/);
    if (product && method === "PUT") {
      const existing = findProduct(product[1] ?? "");
      Object.assign(existing, { name: body.name, priceKurus: body.priceKurus });
      return { status: 200, body: existing };
    }
    if (product && method === "DELETE") {
      menu = menu.map((c) => ({ ...c, products: c.products.filter((p) => p.id !== product[1]) }));
      return { status: 204 };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

async function openMenuAdmin() {
  const u = userEvent.setup();
  renderRoute("/staff/menu");
  await screen.findByRole("heading", { name: "Menü", level: 1 });
  return u;
}

const section = (name: string) => screen.getByRole("region", { name });

describe("menu management", () => {
  it("shows categories and products with prices and option counts", async () => {
    await openMenuAdmin();
    const hot = section("Sıcak İçecekler");
    expect(within(hot).getByText("Latte")).toBeInTheDocument();
    expect(within(hot).getByText("₺160,00 · 2 seçenek grubu")).toBeInTheDocument();
    expect(
      within(section("Tatlılar")).getByRole("switch", { name: "Satışta: Brownie" }),
    ).not.toBeChecked();
  });

  it("adds a category", async () => {
    const u = await openMenuAdmin();
    await u.type(screen.getByPlaceholderText(/Yeni kategori/), "Atıştırmalıklar");
    await u.click(screen.getByRole("button", { name: "+ Kategori ekle" }));
    expect(await screen.findByRole("region", { name: "Atıştırmalıklar" })).toBeInTheDocument();
    expect(calls).toContainEqual(
      expect.objectContaining({ url: "/api/staff/categories", body: { name: "Atıştırmalıklar" } }),
    );
  });

  it("creates a product with an option group", async () => {
    const u = await openMenuAdmin();
    await u.click(within(section("Tatlılar")).getByRole("button", { name: "+ Ürün ekle" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni ürün" });

    await u.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Ürün adını girin.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/api/staff/products")).toEqual([]);

    await u.type(within(dialog).getByLabelText("Ürün adı"), "Tiramisu");
    await u.type(within(dialog).getByLabelText("Fiyat (₺)"), "200,50");
    await u.click(within(dialog).getByRole("button", { name: "+ Seçenek grubu ekle" }));
    await u.type(within(dialog).getByLabelText("Grup adı"), "Porsiyon");
    const [small, large] = within(dialog).getAllByLabelText("Seçenek");
    await u.type(small as HTMLElement, "Normal");
    await u.type(large as HTMLElement, "Büyük");
    const [, largePrice] = within(dialog).getAllByLabelText("Ek fiyat (₺)");
    await u.clear(largePrice as HTMLElement);
    await u.type(largePrice as HTMLElement, "50");
    await u.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    expect(await within(section("Tatlılar")).findByText("Tiramisu")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/staff/products")?.body).toEqual({
      categoryId: ids.desserts,
      name: "Tiramisu",
      description: null,
      priceKurus: 20050,
      isAvailable: true,
      optionGroups: [
        {
          name: "Porsiyon",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: "Normal", priceDeltaKurus: 0, isAvailable: true },
            { name: "Büyük", priceDeltaKurus: 5000, isAvailable: true },
          ],
        },
      ],
    });
  });

  it("edits a product and sends its option ids back", async () => {
    const u = await openMenuAdmin();
    await u.click(screen.getByRole("button", { name: "Düzenle: Latte" }));
    const dialog = screen.getByRole("dialog", { name: "Ürünü düzenle" });
    expect(within(dialog).getByLabelText("Fiyat (₺)")).toHaveValue("160");

    await u.clear(within(dialog).getByLabelText("Fiyat (₺)"));
    await u.type(within(dialog).getByLabelText("Fiyat (₺)"), "175");
    await u.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const put = calls.find(
      (c) => c.method === "PUT" && c.url === `/api/staff/products/${ids.latte}`,
    );
    expect(put?.body).toMatchObject({
      priceKurus: 17500,
      optionGroups: [
        { id: ids.sizeGroup, options: [{ id: ids.small }, { id: ids.large }] },
        { id: ids.extrasGroup },
      ],
    });
    expect(await screen.findByText("₺175,00 · 2 seçenek grubu")).toBeInTheDocument();
  });

  it("switches a product to sold out", async () => {
    const u = await openMenuAdmin();
    const toggle = screen.getByRole("switch", { name: "Satışta: Çay" });
    await u.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Satışta: Çay" })).not.toBeChecked(),
    );
    expect(calls).toContainEqual({
      method: "PATCH",
      url: `/api/staff/products/${ids.cay}/availability`,
      body: { isAvailable: false },
    });
  });

  it("deletes a product after confirming", async () => {
    const u = await openMenuAdmin();
    await u.click(screen.getByRole("button", { name: "Sil: Çay" }));
    await u.click(
      within(screen.getByRole("dialog", { name: "“Çay” silinsin mi?" })).getByRole("button", {
        name: "Evet, sil",
      }),
    );
    await waitFor(() =>
      expect(within(section("Sıcak İçecekler")).queryByText("Çay")).not.toBeInTheDocument(),
    );
  });

  it("explains why a category with products can't be deleted", async () => {
    const u = await openMenuAdmin();
    await u.click(screen.getByRole("button", { name: "Kategoriyi sil: Tatlılar" }));
    await u.click(screen.getByRole("button", { name: "Evet, sil" }));
    expect(await within(section("Tatlılar")).findByRole("alert")).toHaveTextContent(
      "hâlâ ürün var",
    );
  });

  it("moves categories up and down", async () => {
    const u = await openMenuAdmin();
    expect(screen.getByRole("button", { name: "Yukarı taşı: Sıcak İçecekler" })).toBeDisabled();
    await u.click(screen.getByRole("button", { name: "Aşağı taşı: Sıcak İçecekler" }));
    expect(calls).toContainEqual({
      method: "PUT",
      url: "/api/staff/categories/order",
      body: { ids: [ids.desserts, ids.hot] },
    });
    await waitFor(() =>
      expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
        "Tatlılar",
        "Sıcak İçecekler",
      ]),
    );
  });
});

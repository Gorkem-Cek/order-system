import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { menuFixture } from "../../test/menu-fixture";
import { mockFetch, renderRoute } from "../../test/render";

const TOKEN = "TableToken_1234567890";

beforeEach(() => {
  localStorage.clear();
  mockFetch((url) =>
    url === `/api/menu/${TOKEN}` ? { status: 200, body: menuFixture } : { status: 404 },
  );
});
afterEach(() => i18n.changeLanguage("tr"));

async function openMenu() {
  const user = userEvent.setup();
  const view = renderRoute(`/m/${TOKEN}`);
  await screen.findByRole("heading", { name: "Demo Kafe" });
  return { user, ...view };
}

const product = (name: string | RegExp) => screen.getByRole("button", { name });

describe("MenuPage", () => {
  it("shows the café, table, categories and prices", async () => {
    await openMenu();
    expect(screen.getByText("Masa 5")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sıcak İçecekler" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tatlılar" })).toBeInTheDocument();
    expect(product(/^Çay, ₺40,00/)).toBeEnabled();
    expect(product(/^Latte, ₺160,00/)).toBeEnabled();
  });

  it("shows sold-out products greyed out and not orderable", async () => {
    await openMenu();
    expect(product(/^Brownie, ₺150,00, Tükendi/)).toBeDisabled();
  });

  it("searches ignoring Turkish letters and shows a message when nothing matches", async () => {
    const { user } = await openMenu();
    const search = screen.getByRole("searchbox", { name: "Menüde ara" });

    await user.type(search, "cay");
    expect(product(/^Çay/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Latte/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tatlılar" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "pizza");
    expect(screen.getByText("“pizza” için sonuç bulunamadı.")).toBeInTheDocument();
  });

  it("requires choices, prices options and adds the item to the cart", async () => {
    const { user } = await openMenu();
    await user.click(product(/^Latte/));
    const sheet = screen.getByRole("dialog", { name: "Latte" });

    const add = within(sheet).getByRole("button", { name: /Sepete ekle/ });
    expect(add).toBeDisabled();
    expect(within(sheet).getByText("Lütfen seçin: Boyut")).toBeInTheDocument();
    expect(within(sheet).getByRole("checkbox", { name: /Karamel şurubu/ })).toBeDisabled();

    await user.click(within(sheet).getByRole("radio", { name: /Büyük/ }));
    await user.click(within(sheet).getByRole("checkbox", { name: /Ekstra shot/ }));
    await user.click(within(sheet).getByRole("button", { name: "Artır" }));
    await user.type(within(sheet).getByRole("textbox", { name: "Ürün notu" }), "Az köpüklü");
    // (160 + 40 + 35) × 2
    expect(add).toHaveTextContent("Sepete ekle · ₺470,00");
    await user.click(add);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const cartBar = screen.getByRole("button", { name: /Sepeti gör/ });
    expect(cartBar).toHaveTextContent("2 ürün");
    expect(cartBar).toHaveTextContent("₺470,00");

    await user.click(cartBar);
    const cart = screen.getByRole("dialog", { name: "Sepetiniz" });
    expect(within(cart).getByText("2 × Latte")).toBeInTheDocument();
    expect(within(cart).getByText("Büyük, Ekstra shot")).toBeInTheDocument();
    expect(within(cart).getByText("“Az köpüklü”")).toBeInTheDocument();
  });

  it("updates quantities, edits and removes lines in the cart", async () => {
    const { user } = await openMenu();
    await user.click(product(/^Çay/));
    await user.click(screen.getByRole("button", { name: /Sepete ekle/ }));
    await user.click(screen.getByRole("button", { name: /Sepeti gör/ }));
    const cart = screen.getByRole("dialog", { name: "Sepetiniz" });

    await user.click(within(cart).getByRole("button", { name: "Artır" }));
    expect(within(cart).getByText("₺80,00", { selector: "strong" })).toBeInTheDocument();

    await user.click(within(cart).getByRole("button", { name: "Düzenle" }));
    const sheet = screen.getByRole("dialog", { name: "Çay" });
    await user.click(within(sheet).getByRole("button", { name: "Artır" }));
    await user.click(within(sheet).getByRole("button", { name: /Güncelle · ₺120,00/ }));

    const reopened = screen.getByRole("dialog", { name: "Sepetiniz" });
    expect(within(reopened).getByText("3 × Çay")).toBeInTheDocument();
    await user.click(within(reopened).getByRole("button", { name: "Kaldır: Çay" }));
    expect(within(reopened).getByText("Sepetiniz boş.")).toBeInTheDocument();
  });

  it("keeps the cart after a reload", async () => {
    const { user, unmount } = await openMenu();
    await user.click(product(/^Çay/));
    await user.click(screen.getByRole("button", { name: /Sepete ekle/ }));
    unmount();

    await openMenu();
    expect(screen.getByRole("button", { name: /Sepeti gör/ })).toHaveTextContent("1 ürün");
  });

  it("switches the interface to English", async () => {
    const { user } = await openMenu();
    await user.click(screen.getByRole("button", { name: "Dil: English" }));
    expect(screen.getByRole("searchbox", { name: "Search the menu" })).toBeInTheDocument();
    expect(product(/^Brownie, ₺150,00, Sold out/)).toBeDisabled();
    expect(document.documentElement.lang).toBe("en");
  });

  it("explains an unknown table", async () => {
    mockFetch(() => ({ status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } }));
    renderRoute(`/m/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Masa bulunamadı" })).toBeInTheDocument();
  });

  it("explains an inactive café", async () => {
    mockFetch(() => ({
      status: 403,
      body: {
        error: { code: "CAFE_INACTIVE", message: "x", details: { cafeName: "Kapalı Kafe" } },
      },
    }));
    renderRoute(`/m/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Hizmet dışı" })).toBeInTheDocument();
    expect(screen.getByText(/Kapalı Kafe şu anda online sipariş almıyor/)).toBeInTheDocument();
  });

  it("offers a retry when the network fails", { timeout: 10_000 }, async () => {
    let online = false;
    globalThis.fetch = (async () => {
      if (!online) throw new TypeError("offline");
      return new Response(JSON.stringify(menuFixture), { status: 200 });
    }) as typeof fetch;

    const user = userEvent.setup();
    renderRoute(`/m/${TOKEN}`);
    // useMenu retries network errors twice (1 s + 2 s back-off) before giving up.
    const retry = await screen.findByRole("button", { name: "Tekrar dene" }, { timeout: 6_000 });
    online = true;
    await user.click(retry);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Demo Kafe" })).toBeInTheDocument(),
    );
  });
});

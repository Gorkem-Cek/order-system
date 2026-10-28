import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ids, menuFixture } from "../../test/menu-fixture";
import { mockFetch, renderRoute } from "../../test/render";

const TOKEN = "TableToken_1234567890";
const ORDER_ID = "cmord00000000000000000001";

type Handler = (body: unknown) => { status: number; body?: unknown };
let checkoutHandler: Handler;
let checkoutBodies: unknown[];

beforeEach(() => {
  localStorage.clear();
  checkoutBodies = [];
  checkoutHandler = () => ({
    status: 201,
    body: { orderId: ORDER_ID, orderNumber: 12, totalKurus: 8000 },
  });
  mockFetch((url, init) => {
    if (url === `/api/menu/${TOKEN}`) return { status: 200, body: menuFixture };
    if (url === `/api/menu/${TOKEN}/checkout` && init?.method === "POST") {
      const body: unknown = JSON.parse(String(init.body));
      checkoutBodies.push(body);
      return checkoutHandler(body);
    }
    return { status: 404 };
  });
});

/** Adds 2 × Çay with a note, opens checkout and returns the payment dialog. */
async function goToCheckout() {
  const user = userEvent.setup();
  renderRoute(`/m/${TOKEN}`);
  await user.click(await screen.findByRole("button", { name: /^Çay/ }));
  const sheet = screen.getByRole("dialog", { name: "Çay" });
  await user.click(within(sheet).getByRole("button", { name: "Artır" }));
  await user.type(within(sheet).getByRole("textbox", { name: "Ürün notu" }), "Demli");
  await user.click(within(sheet).getByRole("button", { name: /Sepete ekle/ }));
  await user.click(screen.getByRole("button", { name: /Sepeti gör/ }));
  const cart = screen.getByRole("dialog", { name: "Sepetiniz" });
  await user.type(within(cart).getByRole("textbox", { name: "Sipariş notu" }), "Çabuk lütfen");
  await user.click(within(cart).getByRole("button", { name: "Ödemeye geç" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Ödeme" }) };
}

async function fillCard(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  cardNumber = "4242424242424242",
) {
  const field = (name: string) => within(dialog).getByLabelText(name);
  await user.type(field("Kart üzerindeki isim"), "Ayşe Yılmaz");
  await user.type(field("Kart numarası"), cardNumber);
  await user.type(field("Son kullanma (AA/YY)"), "1229");
  await user.type(field("Güvenlik kodu (CVC)"), "123");
}

describe("checkout", () => {
  it("pays, sends only ids and quantities, and shows the order number", async () => {
    const { user, dialog } = await goToCheckout();
    expect(within(dialog).getByText("2 × Çay")).toBeInTheDocument();

    await fillCard(user, dialog);
    expect(within(dialog).getByLabelText("Kart numarası")).toHaveValue("4242 4242 4242 4242");
    expect(within(dialog).getByLabelText("Son kullanma (AA/YY)")).toHaveValue("12/29");
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));

    expect(await screen.findByRole("heading", { name: "Siparişiniz alındı!" })).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
    expect(screen.getByText(/Masa 5 için iletildi/)).toBeInTheDocument();
    expect(checkoutBodies).toEqual([
      {
        lines: [{ productId: ids.cay, quantity: 2, optionIds: [], note: "Demli" }],
        note: "Çabuk lütfen",
        payment: {
          method: "mock",
          cardHolder: "Ayşe Yılmaz",
          cardNumber: "4242 4242 4242 4242",
          expiry: "12/29",
          cvc: "123",
        },
      },
    ]);

    // The cart is emptied after a successful order.
    await user.click(screen.getByRole("button", { name: "Menüye dön" }));
    expect(await screen.findByRole("heading", { name: "Demo Kafe" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sepeti gör/ })).not.toBeInTheDocument();
  });

  it("validates the card before sending anything", async () => {
    const { user, dialog } = await goToCheckout();
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));

    expect(within(dialog).getByText("Kart üzerindeki ismi girin.")).toBeInTheDocument();
    expect(within(dialog).getByText("Geçerli bir kart numarası girin.")).toBeInTheDocument();
    expect(within(dialog).getByText("AA/YY biçiminde girin.")).toBeInTheDocument();
    expect(within(dialog).getByText("3 ya da 4 haneli kodu girin.")).toBeInTheDocument();
    expect(checkoutBodies).toEqual([]);
  });

  it("keeps the cart and explains a declined card", async () => {
    checkoutHandler = () => ({
      status: 402,
      body: { error: { code: "PAYMENT_FAILED", message: "Card declined" } },
    });
    const { user, dialog } = await goToCheckout();
    await fillCard(user, dialog, "4000000000000002");
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Ödeme reddedildi");
    expect(screen.queryByRole("heading", { name: "Siparişiniz alındı!" })).not.toBeInTheDocument();
  });

  it("goes back to the cart when the server says it changed", async () => {
    checkoutHandler = () => ({
      status: 422,
      body: { error: { code: "INVALID_CART", message: "x", details: { lineIndex: 0 } } },
    });
    const { user, dialog } = await goToCheckout();
    await fillCard(user, dialog);
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));

    const cart = await screen.findByRole("dialog", { name: "Sepetiniz" });
    expect(within(cart).getByRole("alert")).toHaveTextContent("Sepetinizdeki bazı ürünler değişti");
  });

  it("can't start checkout while the cart has a line that can no longer be ordered", async () => {
    localStorage.setItem(
      `siparis.cart.${TOKEN}`,
      JSON.stringify({
        lines: [{ key: "k1", productId: ids.brownie, quantity: 1, optionIds: [], note: "" }],
        note: "",
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/m/${TOKEN}`);
    await user.click(await screen.findByRole("button", { name: /Sepeti gör/ }));
    const cart = screen.getByRole("dialog", { name: "Sepetiniz" });
    expect(within(cart).getByRole("button", { name: "Ödemeye geç" })).toBeDisabled();
    expect(within(cart).getByText(/sorunlu ürünleri düzenleyin/)).toBeInTheDocument();
  });
});

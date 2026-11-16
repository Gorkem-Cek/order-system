import type { PaymentMethod, PaymentStatusResponse } from "@siparis/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leaveTo } from "../../lib/navigate";
import { ids, menuFixture } from "../../test/menu-fixture";
import { mockFetch, renderRoute } from "../../test/render";

vi.mock("../../lib/navigate", () => ({ leaveTo: vi.fn() }));

const TOKEN = "TableToken_1234567890";
const PAYMENT_ID = "cmpay00000000000000000001";
const ORDER_ID = "cmord00000000000000000001";
const PAGE_URL = "https://sandbox-cpp.iyzipay.com?token=tok-1";
const CART_KEY = `siparis.cart.${TOKEN}`;
const TEA_CART = JSON.stringify({
  lines: [{ key: "k1", productId: ids.cay, quantity: 2, optionIds: [], note: "" }],
  note: "",
});

let paymentMethod: PaymentMethod;
let checkoutBodies: unknown[];
/** Answers to successive status checks; the last one repeats. */
let statuses: { status: number; body?: PaymentStatusResponse | object }[];
let statusChecks: number;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(leaveTo).mockClear();
  paymentMethod = "iyzico";
  checkoutBodies = [];
  statusChecks = 0;
  statuses = [{ status: 200, body: { status: "PENDING", order: null } }];
  mockFetch((url, init) => {
    if (url === `/api/menu/${TOKEN}`) {
      return { status: 200, body: { ...menuFixture, paymentMethod } };
    }
    if (url === `/api/menu/${TOKEN}/checkout` && init?.method === "POST") {
      checkoutBodies.push(JSON.parse(String(init.body)));
      return {
        status: 200,
        body: { kind: "redirect", paymentId: PAYMENT_ID, paymentPageUrl: PAGE_URL },
      };
    }
    if (url === `/api/menu/${TOKEN}/payments/${PAYMENT_ID}`) {
      const answer = statuses[Math.min(statusChecks, statuses.length - 1)];
      statusChecks++;
      return answer ?? { status: 500 };
    }
    return { status: 404 };
  });
});

async function openCheckout() {
  localStorage.setItem(CART_KEY, TEA_CART);
  const user = userEvent.setup();
  renderRoute(`/m/${TOKEN}`);
  await user.click(await screen.findByRole("button", { name: /Sepeti gör/ }));
  await user.click(screen.getByRole("button", { name: "Ödemeye geç" }));
  return { user, dialog: screen.getByRole("dialog", { name: "Ödeme" }) };
}

const paid = {
  status: 200,
  body: { status: "PAID", order: { orderId: ORDER_ID, orderNumber: 7, totalKurus: 8000 } },
};

describe("paying with iyzico", () => {
  it("asks only for contact details and sends the guest to iyzico's page", async () => {
    const { user, dialog } = await openCheckout();
    expect(within(dialog).queryByLabelText("Kart numarası")).not.toBeInTheDocument();

    const field = (name: string) => within(dialog).getByLabelText(name);
    await user.type(field("Ad"), "Ayşe");
    await user.type(field("Soyad"), "Yılmaz");
    await user.type(field("E-posta"), "ayse@example.com");
    await user.type(field("Cep telefonu"), "0555 111 22 33");
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));

    expect(
      await screen.findByRole("button", { name: "iyzico’ya yönlendiriliyor…" }),
    ).toBeDisabled();
    expect(leaveTo).toHaveBeenCalledWith(PAGE_URL);
    expect(checkoutBodies).toEqual([
      {
        lines: [{ productId: ids.cay, quantity: 2, optionIds: [], note: "" }],
        note: "",
        payment: {
          method: "iyzico",
          buyer: {
            name: "Ayşe",
            surname: "Yılmaz",
            email: "ayse@example.com",
            phone: "0555 111 22 33",
          },
          locale: "tr",
        },
      },
    ]);
    // The cart is kept until iyzico confirms the payment.
    expect(localStorage.getItem(CART_KEY)).toContain(ids.cay);
  });

  it("validates the details and remembers them on this device", async () => {
    const { user, dialog } = await openCheckout();
    await user.type(within(dialog).getByLabelText("Cep telefonu"), "123");
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));
    expect(within(dialog).getByText("Adınızı girin.")).toBeInTheDocument();
    expect(within(dialog).getByText("Geçerli bir e-posta adresi girin.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Geçerli bir cep telefonu girin/)).toBeInTheDocument();
    expect(checkoutBodies).toEqual([]);

    localStorage.setItem(
      "siparis.guest",
      JSON.stringify({
        name: "Ali",
        surname: "Kaya",
        email: "ali@example.com",
        phone: "05551112233",
      }),
    );
    const again = await openCheckoutAgain(user);
    expect(within(again).getByLabelText("Ad")).toHaveValue("Ali");
    expect(within(again).getByLabelText("Cep telefonu")).toHaveValue("05551112233");
  });

  it("explains when iyzico's page can't be opened", async () => {
    mockFetchCheckoutError(502, "PAYMENT_PROVIDER_UNAVAILABLE");
    localStorage.setItem(
      "siparis.guest",
      JSON.stringify({
        name: "Ali",
        surname: "Kaya",
        email: "ali@example.com",
        phone: "05551112233",
      }),
    );
    const { user, dialog } = await openCheckout();
    await user.click(screen.getByRole("button", { name: "₺80,00 öde" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Ödeme sayfası şu anda açılamıyor",
    );
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("says so when the café can't take payments yet", async () => {
    paymentMethod = "none";
    const { dialog } = await openCheckout();
    expect(within(dialog).getByRole("status")).toHaveTextContent("henüz online ödeme almıyor");
    expect(screen.queryByRole("button", { name: /öde$/ })).not.toBeInTheDocument();
  });
});

describe("coming back from iyzico", () => {
  it("waits for the payment to be confirmed, then shows the order and empties the cart", async () => {
    statuses = [{ status: 200, body: { status: "PENDING", order: null } }, paid];
    localStorage.setItem(CART_KEY, TEA_CART);
    renderRoute(`/m/${TOKEN}?payment=${PAYMENT_ID}`);

    expect(
      await screen.findByRole("heading", { name: "Ödemeniz kontrol ediliyor…" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Siparişiniz alındı!" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(localStorage.getItem(CART_KEY)).not.toContain(ids.cay);

    await userEvent.click(screen.getByRole("button", { name: "Menüye dön" }));
    expect(await screen.findByRole("heading", { name: "Demo Kafe" })).toBeInTheDocument();
  });

  it("keeps the cart after a failed payment so the guest can retry", async () => {
    statuses = [{ status: 200, body: { status: "FAILED", order: null } }];
    localStorage.setItem(CART_KEY, TEA_CART);
    const user = userEvent.setup();
    renderRoute(`/m/${TOKEN}?payment=${PAYMENT_ID}`);

    expect(await screen.findByRole("heading", { name: "Ödeme tamamlanmadı" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    const cart = await screen.findByRole("dialog", { name: "Sepetiniz" });
    expect(within(cart).getByRole("button", { name: "Ödemeye geç" })).toBeEnabled();
    expect(within(cart).getAllByText("₺80,00").length).toBeGreaterThan(0);
  });

  it("shows the plain menu for an unknown payment link", async () => {
    statuses = [{ status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } }];
    renderRoute(`/m/${TOKEN}?payment=${PAYMENT_ID}`);
    expect(await screen.findByRole("heading", { name: "Demo Kafe" })).toBeInTheDocument();
  });
});

/** Closes and reopens checkout so the form reads the remembered details again. */
async function openCheckoutAgain(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Sepete dön/ }));
  await user.click(screen.getByRole("button", { name: "Ödemeye geç" }));
  return screen.getByRole("dialog", { name: "Ödeme" });
}

function mockFetchCheckoutError(status: number, code: string) {
  mockFetch((url, init) => {
    if (url === `/api/menu/${TOKEN}`)
      return { status: 200, body: { ...menuFixture, paymentMethod } };
    if (url === `/api/menu/${TOKEN}/checkout` && init?.method === "POST") {
      return { status, body: { error: { code, message: "x" } } };
    }
    return { status: 404 };
  });
}

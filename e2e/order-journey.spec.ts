import { expect, openBoard, orderTea, payWith, test } from "./support/fixtures";

test("scan → order → pay → appears on the board → served → in history", async ({
  page: staff,
  guest,
  cafe,
}) => {
  await openBoard(staff, cafe);
  const newColumn = staff.getByRole("region", { name: "Yeni" });
  const preparing = staff.getByRole("region", { name: "Hazırlanıyor" });

  // The guest scans the table's QR code and finds a product by searching.
  await guest.goto(`/m/${cafe.qrToken}`);
  await expect(guest.getByText(cafe.name)).toBeVisible();
  await guest.getByLabel("Menüde ara").fill("latt");
  await expect(guest.getByRole("button", { name: /^Çay,/ })).toBeHidden();
  await guest.getByRole("button", { name: /^Latte,/ }).click();

  // Options, note and quantity: (160 + 40 + 35) × 2 = 470.
  await guest.getByRole("radio", { name: /Büyük/ }).check();
  await guest.getByRole("checkbox", { name: /Ekstra shot/ }).check();
  await guest.getByLabel("Ürün notu").fill("Şekersiz");
  await guest.getByRole("button", { name: "Artır" }).click();
  await guest.getByRole("button", { name: /Sepete ekle/ }).click();

  await guest.getByRole("button", { name: /Sepeti gör/ }).click();
  await guest.getByLabel("Sipariş notu").fill("Hepsi birlikte");
  await guest.getByRole("button", { name: "Ödemeye geç" }).click();

  // A declined card sends nothing to the staff.
  await payWith(guest, "4000 0000 0000 0002");
  await expect(guest.getByRole("alert")).toContainText("Ödeme reddedildi");
  await expect(staff.getByRole("article")).toHaveCount(0);

  await payWith(guest, "4242 4242 4242 4242");
  await expect(guest.getByRole("heading", { name: "Siparişiniz alındı!" })).toBeVisible();
  await expect(guest.getByText("#1", { exact: true })).toBeVisible();

  // The order reaches the board on its own, without a reload.
  const card = newColumn.getByRole("article", { name: "#1" });
  await expect(card).toContainText("Masa 7");
  await expect(card).toContainText("2 × Latte");
  await expect(card).toContainText("Büyük, Ekstra shot");
  await expect(card).toContainText("Şekersiz");
  await expect(card).toContainText("Hepsi birlikte");
  await expect(card).toContainText("470");

  await card.getByRole("button", { name: "Hazırlamaya başla" }).click();
  const started = preparing.getByRole("article", { name: "#1" });
  await expect(started).toBeVisible();
  await expect(card).toBeHidden();

  // Served orders leave the board immediately but stay in the history.
  await started.getByRole("button", { name: "Servis edildi" }).click();
  await expect(staff.getByRole("article")).toHaveCount(0);

  await staff.getByRole("link", { name: "Geçmiş" }).click();
  const row = staff.getByRole("listitem").filter({ hasText: "#1" });
  await expect(row).toContainText("Masa 7");
  await expect(row).toContainText("Servis edildi");
  await expect(row).toContainText("470");
});

test("staff cancel an order; it stays in the history as cancelled", async ({
  page: staff,
  guest,
  cafe,
}) => {
  await openBoard(staff, cafe);
  await orderTea(guest, cafe);

  await staff
    .getByRole("article", { name: "#1" })
    .getByRole("button", { name: "İptal et" })
    .click();
  await staff.getByRole("button", { name: "Evet, iptal et" }).click();
  await expect(staff.getByRole("article")).toHaveCount(0);

  await staff.getByRole("link", { name: "Geçmiş" }).click();
  await staff.getByLabel("Durum").selectOption("CANCELLED");
  await expect(staff.getByRole("listitem").filter({ hasText: "#1" })).toContainText("İptal edildi");
});

test("a guest calls the waiter and staff answer", async ({ page: staff, guest, cafe }) => {
  await openBoard(staff, cafe);

  await guest.goto(`/m/${cafe.qrToken}`);
  await guest.getByRole("button", { name: "Garson çağır" }).click();
  await expect(guest.getByText("Garson çağrıldı!")).toBeVisible();

  await expect(staff.getByText("Masa 7 garson çağırıyor")).toBeVisible();
  await staff.getByRole("button", { name: "Tamam: Masa 7" }).click();
  await expect(staff.getByText("Masa 7 garson çağırıyor")).toBeHidden();
});

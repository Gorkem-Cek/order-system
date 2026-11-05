import { expect, login, openBoard, test } from "./support/fixtures";

test("a sold-out product can't be ordered; the table's QR link opens the menu", async ({
  page: staff,
  guest,
  cafe,
  baseURL,
}) => {
  await openBoard(staff, cafe);

  await staff.getByRole("link", { name: "Masalar" }).click();
  const menuLink = staff.getByRole("link", { name: "Menüyü aç: Masa 7" });
  await expect(menuLink).toHaveAttribute("href", `${baseURL}/m/${cafe.qrToken}`);
  await expect(staff.getByRole("img", { name: "Masa 7 QR kodu" })).toBeVisible();

  await guest.goto(`/m/${cafe.qrToken}`);
  await expect(guest.getByRole("button", { name: /^Çay,/ })).toBeEnabled();

  await staff.getByRole("link", { name: "Menü", exact: true }).click();
  // click(), not uncheck(): the switch follows the saved menu, so it changes a moment later.
  const onSale = staff.getByRole("switch", { name: "Satışta: Çay" });
  await onSale.click();
  await expect(onSale).not.toBeChecked();
  await expect(staff.getByText("Tükendi")).toBeVisible();

  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Çay,.*Tükendi/ })).toBeDisabled();
});

test("the staff menu fits a phone screen without sideways scrolling", async ({
  page: staff,
  cafe,
}) => {
  await staff.setViewportSize({ width: 390, height: 800 });
  await openBoard(staff, cafe);

  await expect(staff.getByRole("link", { name: "Ayarlar" })).toBeInViewport({ ratio: 1 });
  const overflow = await staff.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("the super-admin switches a café off and on and opens its panel", async ({
  page: admin,
  guest,
  cafe,
  adminEmail,
}) => {
  await login(admin, adminEmail);
  const row = admin.getByRole("listitem", { name: cafe.name });
  await expect(row).toContainText("Aktif");

  await row.getByRole("button", { name: /Pasifleştir/ }).click();
  await admin.getByRole("button", { name: "Evet, pasifleştir" }).click();
  await expect(row).toContainText("Pasif");

  await guest.goto(`/m/${cafe.qrToken}`);
  await expect(guest.getByText("Hizmet dışı")).toBeVisible();

  await row.getByRole("button", { name: /Aktifleştir/ }).click();
  await expect(row).toContainText("Aktif");
  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Çay,/ })).toBeVisible();

  await row.getByRole("button", { name: "Paneli aç" }).click();
  await expect(admin.getByRole("heading", { name: "Siparişler", level: 1 })).toBeVisible();
  await expect(admin.getByRole("banner")).toContainText(cafe.name);
});

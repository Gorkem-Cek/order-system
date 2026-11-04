import type { SessionUser, StaffCafe } from "@siparis/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeEventSource, mockFetch, renderRoute } from "../../test/render";

let cafe: StaffCafe;
let user: SessionUser;
let calls: { method: string; url: string; body?: unknown }[];
let passwordResponse: { status: number; body?: unknown };

beforeEach(() => {
  localStorage.clear();
  FakeEventSource.install();
  cafe = {
    id: "cmcaf00000000000000000001",
    name: "Demo Kafe",
    slug: "demo-kafe",
    logoUrl: null,
    coverUrl: null,
    primaryColor: "#7c4a2d",
    isActive: true,
  };
  user = {
    id: "cmusr00000000000000000001",
    email: "demo@siparis.local",
    name: "Demo Kafe",
    role: "STAFF",
    cafeId: cafe.id,
  };
  calls = [];
  passwordResponse = { status: 204 };

  mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? init.body.get("image")
          : undefined;
    if (method !== "GET") calls.push({ method, url, body });

    if (url === "/api/auth/me") return { status: 200, body: user };
    if (url === "/api/staff/cafe" && method === "GET") return { status: 200, body: cafe };
    if (url === "/api/staff/cafe" && method === "PATCH") {
      cafe = { ...cafe, ...body };
      return { status: 200, body: cafe };
    }
    const image = url.match(/^\/api\/staff\/cafe\/images\/(logo|cover)$/);
    if (image) {
      const field = image[1] === "logo" ? "logoUrl" : "coverUrl";
      cafe = { ...cafe, [field]: method === "POST" ? `/uploads/cafes/c/${image[1]}-1.webp` : null };
      return { status: 200, body: cafe };
    }
    if (url === "/api/auth/password") return passwordResponse;
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "x" } } };
  });
});

async function openSettings() {
  const u = userEvent.setup();
  renderRoute("/staff/settings");
  await screen.findByRole("heading", { name: "Ayarlar", level: 1 });
  return u;
}

const branding = () => screen.getByRole("region", { name: "Kafe görünümü" });
const passwordSection = () => screen.getByRole("region", { name: "Şifre değiştir" });

describe("SettingsPage – branding", () => {
  it("saves a new name and preset colour and updates the panel", async () => {
    const u = await openSettings();
    const save = within(branding()).getByRole("button", { name: "Kaydet" });
    expect(save).toBeDisabled();

    const name = within(branding()).getByLabelText("Kafe adı");
    await u.clear(name);
    await u.type(name, "Köşe Kahve ");
    await u.click(screen.getByRole("button", { name: "Renk #1d4ed8" }));
    expect(screen.getByLabelText("Renk kodu")).toHaveValue("#1d4ed8");
    await u.click(save);

    expect(await screen.findByRole("status")).toHaveTextContent("Kaydedildi.");
    expect(calls).toEqual([
      {
        method: "PATCH",
        url: "/api/staff/cafe",
        body: { name: "Köşe Kahve", primaryColor: "#1d4ed8" },
      },
    ]);
    // The top bar shows the new name straight away.
    expect(screen.getByRole("banner")).toHaveTextContent("Köşe Kahve");
  });

  it("checks the name and colour code before saving", async () => {
    const u = await openSettings();
    const name = within(branding()).getByLabelText("Kafe adı");
    await u.clear(name);
    await u.type(name, "K");
    const hex = screen.getByLabelText("Renk kodu");
    await u.clear(hex);
    await u.type(hex, "#12");
    await u.click(within(branding()).getByRole("button", { name: "Kaydet" }));

    expect(screen.getByText("Kafe adı en az 2 karakter olmalı.")).toBeInTheDocument();
    expect(screen.getByText("#rrggbb biçiminde bir renk girin.")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("uploads and removes the logo", async () => {
    const u = await openSettings();
    const file = new File(["x"], "logo.png", { type: "image/png" });
    await u.upload(screen.getByLabelText("Fotoğraf yükle", { selector: "#cafe-logo" }), file);

    expect(await screen.findByRole("img", { name: "Logo" })).toHaveAttribute(
      "src",
      "/uploads/cafes/c/logo-1.webp",
    );
    expect(calls).toEqual([{ method: "POST", url: "/api/staff/cafe/images/logo", body: file }]);

    await u.click(screen.getAllByRole("button", { name: "Fotoğrafı kaldır" })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole("img", { name: "Logo" })).toBeNull());
    expect(calls.at(-1)).toEqual({
      method: "DELETE",
      url: "/api/staff/cafe/images/logo",
      body: undefined,
    });
  });
});

describe("SettingsPage – password", () => {
  async function fill(u: ReturnType<typeof userEvent.setup>, next: string, repeat = next) {
    const section = passwordSection();
    await u.type(within(section).getByLabelText("Mevcut şifre"), "old-password");
    await u.type(within(section).getByLabelText("Yeni şifre"), next);
    await u.type(within(section).getByLabelText("Yeni şifre (tekrar)"), repeat);
    await u.click(within(section).getByRole("button", { name: "Şifreyi değiştir" }));
  }

  it("changes the password and explains other devices are signed out", async () => {
    const u = await openSettings();
    expect(passwordSection()).toHaveTextContent(/diğer tüm cihazlardaki oturumlar kapanır/);
    await fill(u, "new-password-1");

    expect(await within(passwordSection()).findByRole("status")).toHaveTextContent(
      "Şifre değiştirildi.",
    );
    expect(calls).toEqual([
      {
        method: "POST",
        url: "/api/auth/password",
        body: { currentPassword: "old-password", newPassword: "new-password-1" },
      },
    ]);
    expect(within(passwordSection()).getByLabelText("Mevcut şifre")).toHaveValue("");
  });

  it("checks length and the repeat before sending", async () => {
    const u = await openSettings();
    await fill(u, "short");
    expect(screen.getByRole("alert")).toHaveTextContent("en az 8 karakter");
    await u.clear(within(passwordSection()).getByLabelText("Mevcut şifre"));
    await u.clear(within(passwordSection()).getByLabelText("Yeni şifre"));
    await u.clear(within(passwordSection()).getByLabelText("Yeni şifre (tekrar)"));
    await fill(u, "new-password-1", "new-password-2");
    expect(screen.getByRole("alert")).toHaveTextContent("Yeni şifreler aynı değil.");
    expect(calls).toEqual([]);
  });

  it("says when the current password is wrong", async () => {
    passwordResponse = {
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS", message: "x" } },
    };
    const u = await openSettings();
    await fill(u, "new-password-1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Mevcut şifre yanlış.");
  });

  it("tells a super-admin it changes their own password", async () => {
    user = { ...user, role: "SUPER_ADMIN", cafeId: null };
    localStorage.setItem("siparis.actingCafe", cafe.id);
    await openSettings();
    expect(passwordSection()).toHaveTextContent("kendi süper-admin şifrenizi");
  });
});

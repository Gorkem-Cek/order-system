const tryFormatter = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/** Formats an integer amount of kuruş as Turkish lira, e.g. 125000 → "₺1.250,00". */
export function formatKurus(kurus: number): string {
  if (!Number.isInteger(kurus)) {
    throw new TypeError(`Expected an integer amount of kuruş, got ${kurus}`);
  }
  return tryFormatter.format(kurus / 100);
}

/** Kuruş as an editable lira amount without the symbol: 12050 → "120,50", 4000 → "40". */
export function kurusToInput(kurus: number): string {
  const lira = Math.trunc(kurus / 100);
  const rest = kurus % 100;
  return rest === 0 ? String(lira) : `${lira},${String(rest).padStart(2, "0")}`;
}

/**
 * Parses a lira amount typed by a person into kuruş, or null if it isn't one.
 * Turkish style ("1.250,50") is the default; "120.50" (dot + 1–2 decimals) is also accepted.
 */
export function parseLiraInput(input: string): number | null {
  let text = input.replace(/[\s₺]/g, "").replace(/(TL|TRY)$/i, "");
  if (!text) return null;

  if (text.includes(",")) {
    // Turkish: dots group thousands, the comma starts the decimals.
    text = text.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  } else if (/\.\d{3}(\.|$)/.test(text)) {
    // "1.250" is one thousand two hundred fifty.
    text = text.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [lira = "0", decimals = ""] = text.split(".");
  return Number(lira) * 100 + Number(decimals.padEnd(2, "0"));
}

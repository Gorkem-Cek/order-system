const tryFormatter = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

/** Formats an integer amount of kuruş as Turkish lira, e.g. 125000 → "₺1.250,00". */
export function formatKurus(kurus: number): string {
  if (!Number.isInteger(kurus)) {
    throw new TypeError(`Expected an integer amount of kuruş, got ${kurus}`);
  }
  return tryFormatter.format(kurus / 100);
}

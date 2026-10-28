const TURKISH_TO_ASCII: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

/**
 * Lowercases with Turkish rules and folds Turkish letters and accents, so "cay", "ÇAY"
 * and "Çay" all match each other.
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (letter) => TURKISH_TO_ASCII[letter] ?? letter)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeForSearch(query);
  if (!needle) return true;
  return fields.some((field) => field && normalizeForSearch(field).includes(needle));
}

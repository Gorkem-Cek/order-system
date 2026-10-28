import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { readStorage, writeStorage } from "../lib/storage";
import { en } from "./en";
import { tr, type Translation } from "./tr";

export const LANGUAGES = ["tr", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "siparis.lang";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Translation };
  }
}

function initialLanguage(): Language {
  const stored = readStorage(STORAGE_KEY);
  return stored === "en" ? "en" : "tr";
}

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: "tr",
  supportedLngs: LANGUAGES,
  // React already escapes rendered text.
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  document.documentElement.lang = language;
  writeStorage(STORAGE_KEY, language);
});
document.documentElement.lang = i18n.language;

export default i18n;

/**
 * Language configuration for LandGuard NER.
 *
 * Codes match the `preferred_language` CHECK constraint on user_profiles
 * and the body_* columns on the alerts table, so a user's UI language is
 * also the language their SMS and push alerts arrive in.
 *
 * `reviewed` marks whether the translations have been checked by a native
 * speaker. Unreviewed locales fall back to English for any string that is
 * missing rather than showing a machine guess — in a disaster warning
 * system, an ambiguous instruction is worse than an English one.
 */

export const LOCALES = [
  { code: "en",  name: "English",   native: "English",       script: "latin",     reviewed: true,  dir: "ltr" },
  { code: "hi",  name: "Hindi",     native: "हिन्दी",          script: "devanagari", reviewed: true,  dir: "ltr" },
  { code: "as",  name: "Assamese",  native: "অসমীয়া",         script: "bengali",   reviewed: true,  dir: "ltr" },
  { code: "bn",  name: "Bengali",   native: "বাংলা",           script: "bengali",   reviewed: true,  dir: "ltr" },
  { code: "ne",  name: "Nepali",    native: "नेपाली",           script: "devanagari", reviewed: true,  dir: "ltr" },
  { code: "mni", name: "Manipuri",  native: "মৈতৈলোন্",        script: "bengali",   reviewed: false, dir: "ltr" },
  { code: "lus", name: "Mizo",      native: "Mizo ṭawng",    script: "latin",     reviewed: false, dir: "ltr" },
  { code: "brx", name: "Bodo",      native: "बर'",            script: "devanagari", reviewed: false, dir: "ltr" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lg_lang";

/** Which state each language is primarily spoken in — used to suggest a default. */
export const STATE_DEFAULT_LOCALE: Record<string, Locale> = {
  AS: "as",   // Assam
  ML: "en",   // Meghalaya — English is the official state language
  MN: "mni",  // Manipur
  MZ: "lus",  // Mizoram
  NL: "en",   // Nagaland — English is the official state language
  AR: "en",   // Arunachal Pradesh — English is the official state language
  TR: "bn",   // Tripura
  SK: "ne",   // Sikkim
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && LOCALES.some((l) => l.code === value);
}

export function localeMeta(code: Locale) {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

/** Pick the best supported locale from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const requested = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of requested) {
    const exact = LOCALES.find((l) => l.code === tag);
    if (exact) return exact.code;
    const base = tag.split("-")[0];
    const partial = LOCALES.find((l) => l.code === base);
    if (partial) return partial.code;
  }
  return DEFAULT_LOCALE;
}

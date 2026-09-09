import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiateLocale, type Locale } from "./config";
import { translate, type StringKey } from "./dictionary";

/**
 * Resolve the viewer's language on the server so the first paint is
 * already in the right language — no flash of English, and `<html lang>`
 * is correct for screen readers on the very first response.
 *
 * Order: explicit cookie choice → Accept-Language → English.
 */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  try {
    const h = await headers();
    return negotiateLocale(h.get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Server-side translator, for Server Components. */
export async function getServerT() {
  const locale = await getServerLocale();
  return {
    locale,
    t: (key: StringKey) => translate(locale, key),
  };
}

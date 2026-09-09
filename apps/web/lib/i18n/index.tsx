"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES, isLocale, localeMeta, type Locale,
} from "./config";
import { translate, type StringKey } from "./dictionary";

interface I18nValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: StringKey, fallback?: string) => string;
  meta: ReturnType<typeof localeMeta>;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "landguard.locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private browsing — the cookie below still carries the choice */
  }
  // The cookie is what the server reads on the next request, so the
  // choice survives a reload without a flash of the wrong language.
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=${ONE_YEAR};samesite=lax`;
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Reconcile with localStorage on mount. The server already applied the
  // cookie, so this only matters when the two have drifted apart.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored) && stored !== locale) {
        setLocaleState(stored);
        persist(stored);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persist(next);
  }, []);

  const t = useCallback(
    (key: StringKey, fallback?: string) => translate(locale, key) || fallback || key,
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, meta: localeMeta(locale), locales: LOCALES }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

/**
 * Translate without needing the provider — for the handful of places
 * that render outside it (error boundaries, the service worker shell).
 */
export function tStatic(locale: Locale, key: StringKey) {
  return translate(locale, key);
}

export { LOCALES, type Locale };

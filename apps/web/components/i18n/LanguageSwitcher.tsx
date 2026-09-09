"use client";

import { Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/**
 * Language picker.
 *
 * Deliberately a native <select>: on the low-end Android phones this app
 * targets, the OS picker is faster, works offline, is keyboard and
 * screen-reader accessible for free, and renders every Indic script
 * correctly without shipping a font.
 *
 * Styles live in globals.css (.lang-switcher) to match how the rest of
 * this codebase handles pseudo-states.
 */
export default function LanguageSwitcher({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale, locales, t } = useI18n();

  return (
    <div className={`lang-switcher ${className}`}>
      <Globe size={15} aria-hidden="true" className="lang-switcher__icon" />
      <label htmlFor="language-select" className="sr-only">
        {t("common.language")}
      </label>
      <select
        id="language-select"
        className="lang-switcher__select tap-exempt"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {compact ? l.native : `${l.native}${l.code === "en" ? "" : ` · ${l.name}`}`}
            {l.reviewed ? "" : " (beta)"}
          </option>
        ))}
      </select>
    </div>
  );
}

import type { Alert, Language } from "@/lib/types/database";

/**
 * Which column on `alerts` holds the body for each language.
 *
 * The schema stores one column per language rather than a join table, so
 * an SMS can be assembled without a second query — which matters when a
 * critical alert fans out to thousands of recipients.
 */
const BODY_COLUMN: Record<Language, keyof Alert> = {
  en:  "body",
  hi:  "body_hindi",
  as:  "body_assamese",
  bn:  "body_bengali",
  ne:  "body_nepali",
  mni: "body_manipuri",
  lus: "body_mizo",
  brx: "body_bodo",
};

/**
 * Alert text in the recipient's language, falling back to English.
 *
 * The fallback is deliberate: an untranslated warning in English is
 * actionable, an empty SMS is not.
 */
export function alertBodyFor(alert: Partial<Alert>, language: Language | string): {
  body: string;
  language: Language;
  translated: boolean;
} {
  const lang = (language in BODY_COLUMN ? language : "en") as Language;
  const column = BODY_COLUMN[lang];
  const value = alert[column];

  if (typeof value === "string" && value.trim()) {
    return { body: value.trim(), language: lang, translated: lang !== "en" };
  }
  return { body: (alert.body ?? "").trim(), language: "en", translated: false };
}

/** Severity ordering, for honouring each subscriber's min_severity. */
export const SEVERITY_RANK: Record<string, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

/** GSM-7 messages are 160 chars; longer ones bill as multiple segments. */
export function smsSegments(body: string): number {
  const len = body.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

/** Trim an alert to a single SMS where possible, keeping the helpline. */
export function toSmsText(title: string, body: string, maxLen = 300): string {
  const text = `${title}\n${body}\nNDMA 1078`;
  if (text.length <= maxLen) return text;
  const room = maxLen - title.length - "\nNDMA 1078".length - 2;
  return `${title}\n${body.slice(0, Math.max(0, room - 1))}…\nNDMA 1078`;
}

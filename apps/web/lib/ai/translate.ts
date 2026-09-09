import { chat, defaultModel, availableModels, type ModelSpec } from "./provider";
import type { Locale } from "@/lib/i18n/config";

/**
 * Alert translation.
 *
 * Produces DRAFTS for an officer to review. Nothing here is dispatched
 * automatically.
 *
 * That is not caution for its own sake. Probing sarvam-105b-conversations
 * with "Landslide warning. Move to higher ground now." gave correct,
 * idiomatic output for Hindi, Bengali, Assamese and Nepali — and for Mizo
 * returned romanised *Manipuri* on one call and the non-phrase "Lal vawt
 * in" on the next. A wrong evacuation instruction is worse than an English
 * one, so the reliability tier below drives what the UI tells the officer.
 */

export interface TargetLanguage {
  code: Exclude<Locale, "en">;
  /** Column on the alerts table. */
  column: string;
  name: string;
  script: string;
  /**
   * How far the model can be trusted for this language.
   *  good     — verified idiomatic output, still officer-reviewed
   *  fair     — plausible output, review carefully
   *  unreliable — observed to produce wrong-language or invented text
   */
  tier: "good" | "fair" | "unreliable";
}

export const TARGET_LANGUAGES: TargetLanguage[] = [
  { code: "hi",  column: "body_hindi",    name: "Hindi",    script: "Devanagari",   tier: "good" },
  { code: "bn",  column: "body_bengali",  name: "Bengali",  script: "Bengali",      tier: "good" },
  { code: "as",  column: "body_assamese", name: "Assamese", script: "Assamese",     tier: "good" },
  { code: "ne",  column: "body_nepali",   name: "Nepali",   script: "Devanagari",   tier: "good" },
  { code: "mni", column: "body_manipuri", name: "Manipuri (Meiteilon)", script: "Meitei Mayek", tier: "fair" },
  { code: "brx", column: "body_bodo",     name: "Bodo",     script: "Devanagari",   tier: "fair" },
  { code: "lus", column: "body_mizo",     name: "Mizo",     script: "Latin (Mizo tawng)", tier: "unreliable" },
];

export interface TranslationDraft {
  code: string;
  column: string;
  name: string;
  tier: TargetLanguage["tier"];
  text: string | null;
  error: string | null;
}

const SYSTEM_PROMPT = `You translate emergency landslide and disaster warnings for India's North Eastern Region.

Rules:
- Output ONLY the translation. No preamble, no transliteration, no explanation, no quotes.
- Use the requested language and script exactly. Never substitute a different language.
- Keep it short, plain and imperative — it will be read on a basic phone by someone who may need to move immediately.
- Keep numbers, highway codes (NH-10), place names and phone numbers exactly as written.
- If you cannot translate faithfully into the requested language, reply with exactly: CANNOT_TRANSLATE`;

/** Translate one alert body into one language. */
async function translateOne(
  text: string,
  target: TargetLanguage,
  model: ModelSpec,
  signal?: AbortSignal,
): Promise<TranslationDraft> {
  const base = {
    code: target.code,
    column: target.column,
    name: target.name,
    tier: target.tier,
  };

  try {
    const result = await chat({
      model,
      system: SYSTEM_PROMPT,
      user: `Translate into ${target.name} (${target.script} script):\n\n${text}`,
      temperature: 0.1,
      maxTokens: 700,
      signal,
    });

    const output = result.text.trim();
    if (!output || output.includes("CANNOT_TRANSLATE")) {
      return { ...base, text: null, error: "The model declined to translate this language." };
    }
    return { ...base, text: output, error: null };
  } catch (err) {
    return {
      ...base,
      text: null,
      error: err instanceof Error ? err.message : "Translation failed",
    };
  }
}

/**
 * Translate an alert into every target language.
 *
 * Sequential rather than parallel: this runs inside a serverless function
 * against a rate-limited API, and seven concurrent requests is a reliable
 * way to get throttled halfway through and end up with a partial set.
 */
export async function translateAlert(opts: {
  title: string;
  body: string;
  instruction?: string | null;
  modelId?: string;
  languages?: string[];
  signal?: AbortSignal;
}): Promise<{ model: string; drafts: TranslationDraft[] }> {
  const model =
    availableModels().find((m) => m.id === opts.modelId) ?? defaultModel();

  const source = [opts.title, opts.body, opts.instruction]
    .filter(Boolean)
    .join("\n\n");

  const targets = opts.languages?.length
    ? TARGET_LANGUAGES.filter((t) => opts.languages!.includes(t.code))
    : TARGET_LANGUAGES;

  const drafts: TranslationDraft[] = [];
  for (const target of targets) {
    drafts.push(await translateOne(source, target, model, opts.signal));
  }

  return { model: model.id, drafts };
}

/**
 * AI provider layer.
 *
 * Sarvam AI is the default: it is built for Indian languages, which is
 * exactly the hard part here — Hindi and Bengali are well served by any
 * frontier model, but Manipuri, Mizo and Bodo are not.
 *
 * Model IDs are configuration, not code. Providers rename and retire
 * models frequently, so every id below can be overridden with an env var
 * and the registry can be extended without touching the call sites. If a
 * model id here is wrong or out of date, fix it in the environment rather
 * than in a code change.
 */

export type ProviderId = "sarvam" | "openai" | "google" | "anthropic";

export interface ModelSpec {
  /** Value sent as `model` in the request body. */
  id: string;
  /** Shown in the model picker. */
  label: string;
  provider: ProviderId;
  /** Rough guidance for the UI, not enforced. */
  goodFor: string;
}

/**
 * The switchable model list.
 *
 * Override any id without editing this file:
 *   SARVAM_CHAT_MODEL=...        replaces the default Sarvam chat model
 *   AI_EXTRA_MODELS=id|label|provider,id|label|provider
 */
// Verified against GET https://api.sarvam.ai/v1/models. `sarvam-m` is
// deprecated and the API rejects it outright.
//
// sarvam-105b is a *reasoning* model: it emits chain-of-thought into
// `reasoning_content` and frequently exhausts a normal token budget before
// producing any `content` at all. For short translation work that is both
// slow and expensive, so the conversations variant is the default.
export const MODEL_REGISTRY: ModelSpec[] = [
  {
    id: process.env.SARVAM_CHAT_MODEL || "sarvam-105b-conversations",
    label: "Sarvam 105B (conversations)",
    provider: "sarvam",
    goodFor: "Indic translation — direct answers, no reasoning overhead",
  },
  {
    id: process.env.SARVAM_REASONING_MODEL || "sarvam-105b",
    label: "Sarvam 105B (reasoning)",
    provider: "sarvam",
    goodFor: "Harder reasoning — needs a large token budget",
  },
];

/** Models that return chain-of-thought in `reasoning_content`. */
const REASONING_MODELS = new Set(["sarvam-105b"]);

export function isReasoningModel(id: string): boolean {
  return REASONING_MODELS.has(id);
}

/** Extra models supplied at deploy time, no redeploy of this file needed. */
function extraModels(): ModelSpec[] {
  const raw = process.env.AI_EXTRA_MODELS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.split("|").map((s) => s.trim()))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map(([id, label, provider]) => ({
      id,
      label: label || id,
      provider: (provider as ProviderId) || "sarvam",
      goodFor: "configured at deploy time",
    }));
}

export function availableModels(): ModelSpec[] {
  const all = [...MODEL_REGISTRY, ...extraModels()];
  // De-duplicate by id, keeping the first definition.
  const seen = new Set<string>();
  return all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

export function defaultModel(): ModelSpec {
  const preferred = process.env.AI_DEFAULT_MODEL;
  const models = availableModels();
  return models.find((m) => m.id === preferred) ?? models[0];
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string | undefined;
  /** Sarvam uses its own header name; the rest use bearer auth. */
  headers: (key: string) => Record<string, string>;
  chatPath: string;
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  sarvam: {
    baseUrl: process.env.SARVAM_BASE_URL || "https://api.sarvam.ai",
    apiKey: process.env.SARVAM_API_KEY,
    // Sarvam documents `api-subscription-key`; the bearer header is sent
    // as well so an OpenAI-compatible gateway in front of it also works.
    headers: (key) => ({
      "api-subscription-key": key,
      Authorization: `Bearer ${key}`,
    }),
    chatPath: "/v1/chat/completions",
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com",
    apiKey: process.env.OPENAI_API_KEY,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    chatPath: "/v1/chat/completions",
  },
  google: {
    baseUrl: process.env.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GOOGLE_API_KEY,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    chatPath: "/chat/completions",
  },
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    apiKey: process.env.ANTHROPIC_API_KEY,
    headers: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    chatPath: "/v1/messages",
  },
};

export function isProviderConfigured(provider: ProviderId): boolean {
  return !!PROVIDERS[provider]?.apiKey;
}

export function configuredProviders(): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter(isProviderConfigured);
}

export interface ChatResult {
  text: string;
  model: string;
  provider: ProviderId;
}

/**
 * One chat completion.
 *
 * Every provider here except Anthropic speaks the OpenAI wire format, so
 * there is a single request shape with one branch for Anthropic's.
 */
export async function chat(opts: {
  model?: ModelSpec;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  const model = opts.model ?? defaultModel();
  const config = PROVIDERS[model.provider];
  // Reasoning models spend most of their budget before the answer starts.
  const maxTokens = opts.maxTokens ?? (isReasoningModel(model.id) ? 4096 : 1024);

  if (!config?.apiKey) {
    throw new Error(
      `${model.provider} is not configured — set its API key to enable AI features.`,
    );
  }

  const isAnthropic = model.provider === "anthropic";
  const body = isAnthropic
    ? {
        model: model.id,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.2,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }
    : {
        model: model.id,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.2,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      };

  const res = await fetch(`${config.baseUrl}${config.chatPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...config.headers(config.apiKey) },
    body: JSON.stringify(body),
    signal: opts.signal,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${model.provider} returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    choices?: {
      finish_reason?: string;
      message?: { content?: string | null; reasoning_content?: string | null };
    }[];
    content?: { text?: string }[];
  };

  const choice = json.choices?.[0];
  const text = isAnthropic
    ? (json.content ?? []).map((c) => c.text ?? "").join("").trim()
    : (choice?.message?.content ?? "").trim();

  if (!text) {
    // A reasoning model that ran out of budget mid-thought returns
    // content: null with finish_reason "length". Say so, rather than
    // reporting a generic empty response.
    if (choice?.finish_reason === "length" && choice.message?.reasoning_content) {
      throw new Error(
        `${model.id} exhausted its token budget while reasoning and produced no answer. ` +
        `Raise maxTokens or use a non-reasoning model.`,
      );
    }
    throw new Error(`${model.provider} returned an empty response`);
  }

  return { text, model: model.id, provider: model.provider };
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Languages, ChevronDown, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createAlert, type CreateAlertState } from "@/app/dashboard/alerts/actions";
import { buttonStyle, surface } from "@/components/ui/primitives";

interface Option { id: string; name: string }

const initial: CreateAlertState = { ok: false };

const TRANSLATIONS = [
  { name: "body_hindi",    label: "हिन्दी (Hindi)",        code: "hi" },
  { name: "body_assamese", label: "অসমীয়া (Assamese)",     code: "as" },
  { name: "body_bengali",  label: "বাংলা (Bengali)",        code: "bn" },
  { name: "body_nepali",   label: "नेपाली (Nepali)",        code: "ne" },
  { name: "body_manipuri", label: "মৈতৈলোন্ (Manipuri)",   code: "mni" },
  { name: "body_mizo",     label: "Mizo ṭawng",            code: "lus" },
  { name: "body_bodo",     label: "बर\' (Bodo)",            code: "brx" },
];

interface TranslationDraft {
  code: string;
  column: string;
  name: string;
  tier: "good" | "fair" | "unreliable";
  text: string | null;
  error: string | null;
}

interface ModelOption { id: string; label: string; provider: string }

/** How confident the officer should be in each machine translation. */
const TIER_NOTE: Record<string, { colour: string; note: string }> = {
  good:       { colour: "#86efac", note: "verified quality — still check it" },
  fair:       { colour: "#fcd34d", note: "plausible — read carefully before issuing" },
  unreliable: { colour: "#fca5a5", note: "unreliable — has returned the wrong language; rewrite by hand" },
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  minHeight: 44,
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#ffffff",
  fontSize: 13,
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#a1a1aa",
  marginBottom: 6,
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" style={{ marginTop: 5, fontSize: 11, color: "#fca5a5" }}>
      {errors[0]}
    </p>
  );
}

export default function AlertComposer({
  zones, districts,
}: {
  zones: Option[];
  districts: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [showTranslations, setShowTranslations] = useState(false);
  const [state, formAction, pending] = useActionState(createAlert, initial);

  const formRef = useRef<HTMLFormElement>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [drafts, setDrafts] = useState<TranslationDraft[]>([]);

  useEffect(() => {
    fetch("/api/alerts/translate")
      .then((r) => r.json())
      .then((d: { configured: string[]; models: ModelOption[]; default: string }) => {
        setAiAvailable((d.configured ?? []).length > 0);
        setModels(d.models ?? []);
        setModelId(d.default ?? d.models?.[0]?.id ?? "");
      })
      .catch(() => setAiAvailable(false));
  }, []);

  async function draftTranslations() {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();

    if (!title || !body) {
      toast.error("Write the title and English message first");
      return;
    }

    setTranslating(true);
    setShowTranslations(true);
    try {
      const res = await fetch("/api/alerts/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          instruction: String(data.get("instruction") ?? "") || null,
          model: modelId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Translation failed");
        return;
      }

      const received: TranslationDraft[] = json.drafts ?? [];
      setDrafts(received);

      // Fill the fields so the officer edits real text, not empty boxes.
      for (const draft of received) {
        if (!draft.text) continue;
        const field = form.elements.namedItem(draft.column) as HTMLTextAreaElement | null;
        if (field) field.value = draft.text;
      }

      const ok = received.filter((d) => d.text).length;
      toast.success(`${ok} draft translation${ok === 1 ? "" : "s"} filled in`, {
        description: "Review every one before issuing — these are machine drafts.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={buttonStyle("primary")}>
        <Plus size={15} aria-hidden="true" />
        Issue an alert
      </button>
    );
  }

  return (
    <section style={{ ...surface, padding: 20 }} aria-labelledby="composer-heading">
      <h2 id="composer-heading" style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 16 }}>
        Issue an alert
      </h2>

      {state.error && (
        <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "#fca5a5" }}>
          {state.error}
        </div>
      )}
      {state.ok && (
        <div role="status" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", fontSize: 12, color: "#86efac" }}>
          Alert issued. Use Dispatch on the alert below to send it to subscribers.
        </div>
      )}

      <form ref={formRef} action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label htmlFor="alert_type" style={labelStyle}>Alert type</label>
            <select id="alert_type" name="alert_type" defaultValue="warning" style={field}>
              <option value="watch">Watch — conditions developing</option>
              <option value="advisory">Advisory — stay informed</option>
              <option value="warning">Warning — act now</option>
              <option value="evacuation">Evacuation order</option>
            </select>
          </div>

          <div>
            <label htmlFor="severity" style={labelStyle}>Severity</label>
            <select id="severity" name="severity" defaultValue="high" style={field}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label htmlFor="expires_in_hours" style={labelStyle}>Expires in (hours)</label>
            <input
              id="expires_in_hours" name="expires_in_hours" type="number"
              min={1} max={168} defaultValue={24} style={field}
            />
            <FieldError errors={state.fieldErrors?.expires_in_hours} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div>
            <label htmlFor="zone_id" style={labelStyle}>Risk zone (optional)</label>
            <select id="zone_id" name="zone_id" defaultValue="" style={field}>
              <option value="">Not zone-specific</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="district_id" style={labelStyle}>District</label>
            <select id="district_id" name="district_id" defaultValue="" style={field}>
              <option value="">Region-wide (all subscribers)</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <p style={{ marginTop: 5, fontSize: 11, color: "#52525b" }}>
              Scoping to a district limits SMS to subscribers there.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="title" style={labelStyle}>Title</label>
          <input
            id="title" name="title" type="text" required
            placeholder="Landslide warning — NH-10 Rangpo to Singtam"
            style={field}
          />
          <FieldError errors={state.fieldErrors?.title} />
        </div>

        <div>
          <label htmlFor="body" style={labelStyle}>Message (English)</label>
          <textarea
            id="body" name="body" required rows={3}
            placeholder="Heavy rainfall over the last 72 hours has raised landslide risk on this corridor. Avoid travel between Rangpo and Singtam until further notice."
            style={{ ...field, minHeight: 84, resize: "vertical" }}
          />
          <FieldError errors={state.fieldErrors?.body} />
        </div>

        <div>
          <label htmlFor="instruction" style={labelStyle}>What people should do (optional)</label>
          <input
            id="instruction" name="instruction" type="text"
            placeholder="Move to higher, stable ground away from the slope. Do not shelter below cut slopes."
            style={field}
          />
        </div>

        {/* Translations are collapsed by default — an officer issuing an
            urgent warning should not have to scroll past seven text areas. */}
        <div>
          <button
            type="button"
            onClick={() => setShowTranslations((v) => !v)}
            aria-expanded={showTranslations}
            style={{ ...buttonStyle(), width: "100%", justifyContent: "space-between" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Languages size={14} aria-hidden="true" />
              Translations (optional — untranslated languages receive the English text)
            </span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{ transform: showTranslations ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            />
          </button>

          {showTranslations && (
            <div style={{ marginTop: 12 }}>
              {/* AI drafting — model is switchable */}
              {aiAvailable && (
                <div style={{
                  display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                  padding: "12px 14px", marginBottom: 14, borderRadius: 10,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
                }}>
                  <label htmlFor="ai-model" className="sr-only">Translation model</label>
                  <select
                    id="ai-model"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    style={{ ...field, width: "auto", minWidth: 220, minHeight: 38, padding: "8px 10px" }}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => void draftTranslations()}
                    disabled={translating}
                    style={{ ...buttonStyle(), minHeight: 38, opacity: translating ? 0.6 : 1 }}
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    {translating ? "Translating…" : "Draft with AI"}
                  </button>

                  <span style={{ fontSize: 11, color: "#52525b", flex: 1, minWidth: 200 }}>
                    Fills the fields below with machine drafts for you to edit. Nothing is sent until you issue the alert.
                  </span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                {TRANSLATIONS.map((t) => {
                  const draft = drafts.find((d) => d.column === t.name);
                  const tier = draft ? TIER_NOTE[draft.tier] : null;
                  return (
                    <div key={t.name}>
                      <label htmlFor={t.name} style={labelStyle}>{t.label}</label>
                      <textarea
                        id={t.name}
                        name={t.name}
                        rows={2}
                        style={{
                          ...field,
                          minHeight: 62,
                          resize: "vertical",
                          borderColor: draft?.tier === "unreliable"
                            ? "rgba(239,68,68,0.45)"
                            : "rgba(255,255,255,0.12)",
                        }}
                      />
                      {tier && (
                        <p style={{
                          marginTop: 5, fontSize: 10.5, color: tier.colour,
                          display: "flex", alignItems: "flex-start", gap: 5, lineHeight: 1.45,
                        }}>
                          {draft?.tier === "unreliable" && (
                            <AlertTriangle size={11} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                          )}
                          {tier.note}
                        </p>
                      )}
                      {draft?.error && (
                        <p role="alert" style={{ marginTop: 5, fontSize: 10.5, color: "#fca5a5" }}>
                          {draft.error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={pending} style={{ ...buttonStyle("primary"), opacity: pending ? 0.6 : 1 }}>
            {pending ? "Issuing…" : "Issue alert"}
          </button>
          <button type="button" onClick={() => setOpen(false)} style={buttonStyle()}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

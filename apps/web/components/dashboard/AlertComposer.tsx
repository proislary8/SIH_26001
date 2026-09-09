"use client";

import { useActionState, useState } from "react";
import { Plus, Languages, ChevronDown } from "lucide-react";
import { createAlert, type CreateAlertState } from "@/app/dashboard/alerts/actions";
import { buttonStyle, surface } from "@/components/ui/primitives";

interface Option { id: string; name: string }

const initial: CreateAlertState = { ok: false };

const TRANSLATIONS = [
  { name: "body_hindi",    label: "हिन्दी (Hindi)" },
  { name: "body_assamese", label: "অসমীয়া (Assamese)" },
  { name: "body_bengali",  label: "বাংলা (Bengali)" },
  { name: "body_nepali",   label: "नेपाली (Nepali)" },
  { name: "body_manipuri", label: "মৈতৈলোন্ (Manipuri)" },
  { name: "body_mizo",     label: "Mizo ṭawng" },
  { name: "body_bodo",     label: "बर' (Bodo)" },
];

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

      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
              {TRANSLATIONS.map((t) => (
                <div key={t.name}>
                  <label htmlFor={t.name} style={labelStyle}>{t.label}</label>
                  <textarea id={t.name} name={t.name} rows={2} style={{ ...field, minHeight: 62, resize: "vertical" }} />
                </div>
              ))}
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

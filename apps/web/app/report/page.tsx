"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, MapPin, AlertTriangle, Upload, CheckCircle, ArrowLeft, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { drain, enqueue } from "@/lib/offline/queue";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

/**
 * Hazard types. Icons and values are fixed; the wording comes from the
 * translation dictionary so the form reads in the citizen's own language —
 * which is the whole point of a public reporting channel in the NER.
 */
const OBSERVATION_TYPES = [
  { value: "slope_crack",   icon: "🪨", labelKey: "obs.slope_crack",   descKey: "obs.slope_crack.desc" },
  { value: "road_block",    icon: "🚧", labelKey: "obs.road_block",    descKey: "obs.road_block.desc" },
  { value: "rockfall",      icon: "⛰️", labelKey: "obs.rockfall",      descKey: "obs.rockfall.desc" },
  { value: "water_seepage", icon: "💧", labelKey: "obs.water_seepage", descKey: "obs.water_seepage.desc" },
  { value: "mudslide",      icon: "🌊", labelKey: "obs.mudslide",      descKey: "obs.mudslide.desc" },
] as const;

const NE_DISTRICTS: Record<string, string[]> = {
  "Assam": ["Dima Hasao", "Cachar", "Kamrup", "Goalpara", "Bongaigaon", "Dhubri", "Karbi Anglong", "West Karbi Anglong"],
  "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Kolasib", "Mamit", "Serchhip"],
  "Sikkim": ["North Sikkim", "South Sikkim", "East Sikkim", "West Sikkim"],
  "Meghalaya": ["East Khasi Hills", "West Khasi Hills", "Jaintia Hills", "Garo Hills"],
  "Manipur": ["Tamenglong", "Churachandpur", "Senapati", "Imphal West", "Chandel"],
  "Nagaland": ["Kohima", "Dimapur", "Phek", "Tuensang", "Mokokchung"],
  "Arunachal Pradesh": ["West Siang", "East Siang", "Lower Dibang Valley", "Tawang"],
  "Tripura": ["Dhalai", "Gomati", "Sepahijala", "West Tripura"],
};

interface DistrictOption {
  id: string;
  name: string;
  state_name: string;
  lat: number | null;
  lng: number | null;
}

export default function ReportPage() {
  const { t, locale } = useI18n();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    state: "Assam",
    district: "Dima Hasao",
    observation_type: "slope_crack",
    description: "",
    severity: "medium",
    lat: 25.625,
    lng: 92.725,
    reporter_name: "",
    reporter_phone: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dbDistricts, setDbDistricts] = useState<DistrictOption[]>([]);

  // Districts come from the database so the picker matches the zones the
  // risk engine actually scores. NE_DISTRICTS below is the offline
  // fallback for a first visit with no connection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("ner_districts")
          .select("id, name, ner_states(name)")
          .order("name");
        if (cancelled || !data) return;
        setDbDistricts(
          data.map((d: { id: string; name: string; ner_states: { name: string } | { name: string }[] | null }) => ({
            id: d.id,
            name: d.name,
            state_name: Array.isArray(d.ner_states)
              ? (d.ner_states[0]?.name ?? "")
              : (d.ner_states?.name ?? ""),
            lat: null,
            lng: null,
          })),
        );
      } catch {
        /* offline — the hardcoded fallback list stays in use */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statesList = dbDistricts.length
    ? Array.from(new Set(dbDistricts.map((d) => d.state_name))).filter(Boolean).sort()
    : Object.keys(NE_DISTRICTS);

  const districts = dbDistricts.length
    ? dbDistricts.filter((d) => d.state_name === formData.state).map((d) => d.name)
    : NE_DISTRICTS[formData.state] || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleGetLocation = () => {
    setGpsLoading(true);
    setUploadStatus(null);

    if (!navigator.geolocation) {
      setGpsLoading(false);
      setUploadStatus(t("report.locationDenied"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Six decimals ≈ 0.1 m. The old four-decimal rounding threw away
        // ~11 m of precision, which matters when locating a specific slope.
        setFormData((prev) => ({
          ...prev,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        }));
        setAccuracy(pos.coords.accuracy ?? null);
        setGpsLoading(false);
        setUploadStatus(t("report.locationFound"));
      },
      () => {
        setGpsLoading(false);
        setUploadStatus(t("report.locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setUploadStatus(t("report.submitting"));

    // Every report is written to the local queue first and sent second.
    // That single path means the offline case is exercised on every
    // submission rather than only when the network happens to be down,
    // and a crash mid-send can never lose a citizen's report.
    try {
      await enqueue({
        lat: formData.lat,
        lng: formData.lng,
        accuracy_m: accuracy,
        report_type: formData.observation_type,
        severity: formData.severity,
        description: formData.description.trim(),
        reporter_name: formData.reporter_name.trim() || null,
        reporter_phone: formData.reporter_phone.trim() || null,
        language: locale,
        affects_road: ["road_block", "mudslide", "rockfall"].includes(formData.observation_type),
        photo: selectedFile,
        photo_name: selectedFile?.name ?? null,
        captured_at: new Date().toISOString(),
      });
    } catch (err) {
      // The queue itself failed (private browsing blocks IndexedDB).
      setSubmitting(false);
      setSubmitError(
        err instanceof Error ? err.message : "Could not save the report on this device",
      );
      setUploadStatus(null);
      return;
    }

    if (!navigator.onLine) {
      setSubmitting(false);
      setQueuedOffline(true);
      setSubmitted(true);
      setUploadStatus(null);
      return;
    }

    const { sent, failed } = await drain();
    setSubmitting(false);
    setSubmitted(true);
    setQueuedOffline(sent === 0);
    setUploadStatus(
      failed > 0 && sent === 0
        ? t("report.queuedHelp")
        : null,
    );
  };

  const selectedObsType = OBSERVATION_TYPES.find((o) => o.value === formData.observation_type);

  const STEPS = [
    { num: 1, label: t("report.step1") },
    { num: 2, label: t("report.step2") },
    { num: 3, label: t("report.step3") },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes successPop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}
        .type-card { transition: all 0.18s; cursor: pointer; }
        .type-card:hover { border-color: rgba(251,146,60,0.4) !important; background: rgba(251,146,60,0.06) !important; }
        .type-card.selected { border-color: rgba(251,146,60,0.5) !important; background: rgba(251,146,60,0.08) !important; }
        .sev-btn { transition: all 0.15s; cursor: pointer; }
        .sev-btn:hover { opacity: 0.9; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(3,7,18,0.95)",
        backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={16} /> {t("common.back")}
          </Link>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>

        {/* Page Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 100, background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.2)", color: "#fb923c", fontSize: 11, fontWeight: 700, marginBottom: 16 }}>
            <AlertTriangle size={12} /> Crowdsourced Hazard Intelligence
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "white", marginBottom: 10, letterSpacing: "-0.02em" }}>{t("report.title")}</h1>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
            {t("report.subtitle")}
          </p>
        </div>

        {submitted ? (
          // Success screen
          <div style={{ textAlign: "center", padding: "60px 40px", borderRadius: 24, background: "#0b1329", border: "1px solid rgba(34,197,94,0.25)", animation: "successPop 0.4s ease" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: queuedOffline ? "rgba(251,191,36,0.15)" : "rgba(34,197,94,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
            }}>
              {queuedOffline
                ? <Upload size={36} style={{ color: "#fbbf24" }} aria-hidden="true" />
                : <CheckCircle size={36} style={{ color: "#22c55e" }} aria-hidden="true" />}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "white", marginBottom: 12 }}>
              {queuedOffline ? t("report.queued") : t("report.submitted")}
            </h2>
            <p style={{ fontSize: 14, color: "#94a3b8", maxWidth: 420, margin: "0 auto 8px", lineHeight: 1.7 }}>
              {queuedOffline ? t("report.queuedHelp") : t("report.submittedHelp")}
            </p>
            {uploadStatus && <p style={{ fontSize: 12, color: "#fb923c", marginBottom: 24 }}>{uploadStatus}</p>}
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 32 }}>
              <button
                onClick={() => { setSubmitted(false); setSelectedFile(null); setPreviewUrl(null); setStep(1); setUploadStatus(null); setQueuedOffline(false); setSubmitError(null); setAccuracy(null); }}
                style={{ padding: "11px 22px", borderRadius: 100, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Submit Another Report
              </button>
              <Link href="/map" style={{ padding: "11px 22px", borderRadius: 100, background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", color: "#fb923c", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                View on Live Map →
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 36 }}>
              {STEPS.map((s, i) => (
                <React.Fragment key={s.num}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: 14,
                      background: step > s.num ? "#22c55e" : step === s.num ? "white" : "rgba(255,255,255,0.06)",
                      color: step > s.num ? "white" : step === s.num ? "black" : "#475569",
                      border: step >= s.num ? "none" : "1px solid rgba(255,255,255,0.1)",
                      cursor: step > s.num ? "pointer" : "default",
                    }} onClick={() => { if (step > s.num) setStep(s.num); }}>
                      {step > s.num ? "✓" : s.num}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: step >= s.num ? "#e2e8f0" : "#475569", whiteSpace: "nowrap" }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: step > s.num ? "#22c55e" : "rgba(255,255,255,0.06)", margin: "0 8px", marginBottom: 28 }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            <form onSubmit={handleSubmit}>

              {/* Step 1: What did you see? */}
              {step === 1 && (
                <div style={{ animation: "slideIn 0.25s ease" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6 }}>{t("report.step1")}</div>
                  <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>{t("report.subtitle")}</p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                    {OBSERVATION_TYPES.map((o) => (
                      <div
                        key={o.value}
                        className={`type-card ${formData.observation_type === o.value ? "selected" : ""}`}
                        onClick={() => setFormData({ ...formData, observation_type: o.value })}
                        style={{
                          display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderRadius: 16,
                          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <span style={{ fontSize: 26, flexShrink: 0 }}>{o.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 3 }}>{t(o.labelKey)}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{t(o.descKey)}</div>
                        </div>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                          background: formData.observation_type === o.value ? "#fb923c" : "rgba(255,255,255,0.06)",
                          border: formData.observation_type === o.value ? "none" : "1px solid rgba(255,255,255,0.15)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {formData.observation_type === o.value && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Severity */}
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 5 }}>How dangerous does it look?</div>
                    <p style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>Your best estimate is fine — authorities will verify</p>
                    <div className="sev-grid">
                      {[
                        { value: "low", label: "Minor", icon: "🟢", desc: "Small crack, slow seepage" },
                        { value: "medium", label: "Moderate", icon: "🟡", desc: "Partial road block" },
                        { value: "high", label: "Serious", icon: "🟠", desc: "Active movement" },
                        { value: "critical", label: "Emergency", icon: "🔴", desc: "Life threatening" },
                      ].map((sev) => (
                        <div
                          key={sev.value}
                          className="sev-btn"
                          onClick={() => setFormData({ ...formData, severity: sev.value })}
                          style={{
                            padding: "14px 10px", borderRadius: 12, textAlign: "center",
                            background: formData.severity === sev.value ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                            border: formData.severity === sev.value ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{sev.icon}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "white", marginBottom: 3 }}>{sev.label}</div>
                          <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.4 }}>{sev.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    style={{ width: "100%", padding: "14px", borderRadius: 14, background: "white", color: "black", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer" }}
                  >
                    Next: Where Is It? →
                  </button>
                </div>
              )}

              {/* Step 2: Where is it? */}
              {step === 2 && (
                <div style={{ animation: "slideIn 0.25s ease" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6 }}>{t("report.step2")}</div>
                  <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Select your state and district, or tap to auto-detect your location</p>

                  {/* GPS Button — primary */}
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={gpsLoading}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      padding: "16px", borderRadius: 16, marginBottom: 20,
                      background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)",
                      color: "#60a5fa", fontSize: 15, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {gpsLoading ? (
                      <>
                        <div style={{ width: 16, height: 16, border: "2px solid rgba(96,165,250,0.3)", borderTopColor: "#60a5fa", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        Detecting your location...
                      </>
                    ) : (
                      <>
                        <MapPin size={18} />
                        📍 Auto-Detect My Location (Recommended)
                      </>
                    )}
                  </button>

                  {formData.lat !== 25.625 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: 20 }}>
                      <CheckCircle size={14} style={{ color: "#22c55e" }} />
                      <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>Location detected: {formData.lat}, {formData.lng}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                    <span style={{ fontSize: 11, color: "#475569" }}>or select manually</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                  </div>

                  <div className="report-2col" style={{ marginBottom: 32 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>State</label>
                      <select
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value, district: NE_DISTRICTS[e.target.value]?.[0] || "" })}
                        style={{ width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#e2e8f0", outline: "none" }}
                      >
                        {statesList.map((st) => <option key={st}>{st}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>District</label>
                      <select
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                        style={{ width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#e2e8f0", outline: "none" }}
                      >
                        {districts.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" onClick={() => setStep(1)} style={{ flex: 1, padding: "13px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      ← Back
                    </button>
                    <button type="button" onClick={() => setStep(3)} style={{ flex: 2, padding: "13px", borderRadius: 14, background: "white", color: "black", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer" }}>
                      Next: Add Photo →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Photo + Details + Submit */}
              {step === 3 && (
                <div style={{ animation: "slideIn 0.25s ease" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6 }}>Step 3 — Add a Photo & Send</div>
                  <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>A photo helps authorities respond faster. You can skip it if needed.</p>

                  {/* Summary so far */}
                  <div style={{ padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Your Report Summary</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div><span style={{ fontSize: 11, color: "#475569" }}>Type: </span><span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{selectedObsType?.icon} {selectedObsType ? t(selectedObsType.labelKey) : ""}</span></div>
                      <div><span style={{ fontSize: 11, color: "#475569" }}>Severity: </span><span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{formData.severity.charAt(0).toUpperCase() + formData.severity.slice(1)}</span></div>
                      <div><span style={{ fontSize: 11, color: "#475569" }}>Location: </span><span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{formData.district}, {formData.state}</span></div>
                      <div><span style={{ fontSize: 11, color: "#475569" }}>GPS: </span><span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{formData.lat}, {formData.lng}</span></div>
                    </div>
                  </div>

                  {/* Photo upload */}
                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "white", marginBottom: 12 }}>📷 Photo of the Hazard (Optional but Helpful)</label>
                    <div style={{ position: "relative", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 16, padding: "28px", textAlign: "center", background: "rgba(255,255,255,0.02)", cursor: "pointer" }}>
                      <input type="file" accept="image/*" onChange={handleFileChange} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                      {previewUrl ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <img src={previewUrl} alt="Preview" style={{ height: 140, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.15)" }} />
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{selectedFile?.name} · Tap to change</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                          <Camera size={32} style={{ color: "#475569" }} />
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>Tap here to take or upload a photo</div>
                          <div style={{ fontSize: 11, color: "#475569" }}>JPEG, PNG, WebP — Max 10MB</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "white", marginBottom: 8 }}>📝 Describe What You Saw (Optional)</label>
                    <textarea
                      rows={3}
                      placeholder="Example: 'Large crack running across the slope near the mango grove, about 5 meters long. Road NH-27 partially blocked near km 42.'"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      style={{ width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px", fontSize: 13, color: "#e2e8f0", outline: "none", resize: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Reporter info */}
                  <div className="report-2col" style={{ marginBottom: 28 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 8 }}>Your Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Ramesh Lal"
                        value={formData.reporter_name}
                        onChange={(e) => setFormData({ ...formData, reporter_name: e.target.value })}
                        style={{ width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 8 }}>Phone for Verification (Optional)</label>
                      <input
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={formData.reporter_phone}
                        onChange={(e) => setFormData({ ...formData, reporter_phone: e.target.value })}
                        style={{ width: "100%", background: "#0a0f1d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {uploadStatus && (
                    <div role="status" aria-live="polite" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", fontSize: 12, color: "#fb923c" }}>
                      {uploadStatus}
                    </div>
                  )}

                  {submitError && (
                    <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "#f87171" }}>
                      {submitError}
                      <div style={{ marginTop: 6, color: "#fca5a5", fontSize: 11 }}>
                        Call the district control room on 1077 if you cannot send this report.
                      </div>
                    </div>
                  )}

                  {accuracy !== null && (
                    <p style={{ marginBottom: 12, fontSize: 11, color: "#64748b" }}>
                      GPS accuracy: ±{Math.round(accuracy)} m
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" onClick={() => setStep(2)} style={{ flex: 1, padding: "13px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                      ← Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      style={{
                        flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                        padding: "14px", borderRadius: 14,
                        background: submitting ? "rgba(251,146,60,0.5)" : "#ea580c",
                        color: "white", fontWeight: 800, fontSize: 15, border: "none",
                        cursor: submitting ? "not-allowed" : "pointer",
                        boxShadow: "0 4px 20px rgba(234,88,12,0.3)",
                      }}
                    >
                      {submitting ? (
                        <>
                          <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          Submit Report to Authorities
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </>
        )}

        <nav className="mobile-bottom-nav">
          <Link href="/">
            <span className="icon">🏠</span>
            <span>Home</span>
          </Link>
          <Link href="/map">
            <span className="icon">🗺️</span>
            <span>Live Map</span>
          </Link>
          <Link href="/alerts">
            <span className="icon">🔔</span>
            <span>Alerts</span>
          </Link>
          <Link href="/shelter">
            <span className="icon">🏥</span>
            <span>Shelters</span>
          </Link>
          <Link href="/report" className="active">
            <span className="icon">📸</span>
            <span>Report</span>
          </Link>
        </nav>
      </main>
    </div>
  );
}

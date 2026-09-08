"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function normalisePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return d.length >= 10 ? `+91${d.slice(-10)}` : "";
}

const S: Record<string, React.CSSProperties> = {
  label:  { display: "block", fontSize: 13, fontWeight: 600, color: "#a1a1aa", marginBottom: 7 },
  input:  { width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "11px 14px", fontSize: 14, color: "white", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" },
  err:    { display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(239,68,68,0.25)", fontSize: 13, color: "#fca5a5" },
  btnWht: { width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "white", color: "black", fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s" },
  btnDim: { width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#1a1a1a", color: "#52525b", fontWeight: 700, fontSize: 14, cursor: "not-allowed" },
};

/* ─── Forgot Password mini‑modal ───────────────────────────────────────── */
function ForgotModal({ onClose }: { onClose: () => void }) {
  const [type, setType]   = useState<"email" | "phone">("email");
  const [val, setVal]     = useState("");
  const [loading, setL]   = useState(false);
  const [sent, setSent]   = useState(false);
  const [err, setErr]     = useState("");
  const supabase = createClient();

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setL(true); setErr("");

    try {
      let email = val.trim();

      if (type === "phone") {
        const phone = normalisePhone(val);
        if (!phone) { setErr("Enter a valid 10-digit Indian mobile number."); setL(false); return; }
        const res  = await fetch(`/api/auth/phone-lookup?phone=${encodeURIComponent(phone)}`);
        const data = await res.json();
        if (!res.ok) { setErr(data.error ?? "No account found with this phone number."); setL(false); return; }
        email = data.email;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) { setErr(error.message); setL(false); return; }
      setSent(true);
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setL(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 400, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: 32 }}>
        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>

        {sent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Check your email</h3>
            <p style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6, marginBottom: 24 }}>
              A password reset link has been sent. It expires in 1 hour. Check your spam folder too.
            </p>
            <button onClick={onClose} style={{ ...S.btnWht, width: "auto", padding: "10px 24px" }}>Done</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Forgot password?</h3>
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 20, lineHeight: 1.5 }}>
              Enter your email or mobile number to receive a reset link.
            </p>

            {/* Toggle */}
            <div style={{ display: "flex", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: 3, marginBottom: 18 }}>
              {(["email", "phone"] as const).map(t => (
                <button key={t} onClick={() => { setType(t); setVal(""); setErr(""); }} style={{
                  flex: 1, padding: "7px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                  background: type === t ? "rgba(255,255,255,0.12)" : "transparent",
                  color: type === t ? "white" : "#52525b", transition: "all 0.15s",
                }}>
                  {t === "email" ? "📧 Email" : "📱 Mobile"}
                </button>
              ))}
            </div>

            <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {type === "email" ? (
                <input type="email" required placeholder="officer@ndma.gov.in" value={val} onChange={e => { setVal(e.target.value); setErr(""); }} style={S.input} />
              ) : (
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#71717a", fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>+91</span>
                  <input type="tel" required placeholder="98765 43210" inputMode="numeric" maxLength={12} value={val} onChange={e => { setVal(e.target.value); setErr(""); }} style={{ ...S.input, paddingLeft: 48 }} />
                </div>
              )}

              {err && <div style={S.err}><span>⚠️</span><span>{err}</span></div>}

              <button type="submit" disabled={loading || !val} style={loading || !val ? S.btnDim : S.btnWht}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "black", animation: "spin 1s linear infinite", display: "inline-block" }} />
                    Sending…
                  </span>
                ) : "Send Reset Link →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Login Form ──────────────────────────────────────────────────── */
function LoginForm() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const supabase     = createClient();

  const [tab, setTab]           = useState<"login" | "signup">("login");
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [loading, setLoading]   = useState(false);
  const [showForgot, setForgot] = useState(false);
  const [showPw, setShowPw]     = useState(false);
  const [phoneError, setPhoneErr] = useState("");
  const [formError, setFormErr]  = useState("");
  const [lookingUp, setLookUp]  = useState(false);
  const resolvedEmailRef        = useRef<string | null>(null);

  const error = searchParams.get("error");

  useEffect(() => {
    if (searchParams.get("tab") === "signup") setTab("signup");
  }, [searchParams]);

  /* Phone → resolve email on blur (login only) */
  const handlePhoneBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    if (tab !== "login" || loginMode !== "phone") return;
    const phone = normalisePhone(e.target.value);
    if (!phone) return;

    setLookUp(true);
    try {
      const res  = await fetch(`/api/auth/phone-lookup?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (res.ok && data.email) {
        resolvedEmailRef.current = data.email;
        setPhoneErr(""); // valid
      } else {
        resolvedEmailRef.current = null;
        setPhoneErr(data.error ?? "No account with this number.");
      }
    } catch {
      resolvedEmailRef.current = null;
    } finally {
      setLookUp(false);
    }
  };

  /* Client-side login via Supabase (phone path resolves email first) */
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    if (tab === "signup") return; // let form POST natively for signup
    e.preventDefault();
    setLoading(true);
    setFormErr("");

    const fd       = new FormData(e.currentTarget);
    const password = fd.get("password") as string;

    let email: string;

    if (loginMode === "phone") {
      if (!resolvedEmailRef.current) {
        // Try one more lookup
        const rawPhone = fd.get("phone_login") as string;
        const phone    = normalisePhone(rawPhone);
        const res      = await fetch(`/api/auth/phone-lookup?phone=${encodeURIComponent(phone)}`);
        const data     = await res.json();
        if (!res.ok || !data.email) {
          setFormErr(data.error ?? "No account found with this phone number.");
          setLoading(false);
          return;
        }
        email = data.email;
      } else {
        email = resolvedEmailRef.current;
      }
    } else {
      email = fd.get("email") as string;
    }

    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });

    if (loginErr) {
      setFormErr(loginErr.message === "Invalid login credentials"
        ? "Incorrect email / phone or password."
        : loginErr.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const FEATURES = [
    { icon: "🗺️", text: "Live Risk Map — 8 NE States, 22 Risk Zones" },
    { icon: "📱", text: "Auto SMS Alerts to your registered phone" },
    { icon: "🆘", text: "One-Tap SOS to nearest NDRF/SDRF team" },
    { icon: "🏠", text: "Nearest Safe Shelter with directions" },
    { icon: "📵", text: "Offline-first — works without internet" },
    { icon: "🛰️", text: "Sentinel-1 SAR Change Detection" },
    { icon: "🌧️", text: "72-Hour Antecedent Rainfall Scoring" },
    { icon: "🤖", text: "AI Multilingual Alerts (10+ NE languages)" },
  ];

  return (
    <>
      {showForgot && <ForgotModal onClose={() => setForgot(false)} />}

      <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", position: "relative", overflow: "hidden", fontFamily: "system-ui,sans-serif" }}>

        {/* Grid */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "50px 50px" }} />

        {/* ── Left feature panel ─────────────────────────── */}
        <div style={{ width: 440, flexShrink: 0, padding: 40, borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", zIndex: 1 }} className="hidden-mobile">
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 22 }}>🏔️</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "white" }}>LandGuard<span style={{ color: "#71717a" }}>NER</span></span>
          </Link>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>What you get</div>
            {FEATURES.map(({ icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>{icon}</div>
                <span style={{ fontSize: 13, color: "#71717a" }}>{text}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#3f3f46" }}>SIH 2026 · MDoNER · Disaster Management</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#3f3f46", marginTop: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              System Operational
            </div>
          </div>
        </div>

        {/* ── Right form panel ───────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", zIndex: 1, overflowY: "auto" }}>
          <div style={{ width: "100%", maxWidth: 370 }}>

            {/* Mobile logo */}
            <div className="mobile-only" style={{ textAlign: "center", marginBottom: 28 }}>
              <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
                <span style={{ fontSize: 20 }}>🏔️</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>LandGuard<span style={{ color: "#71717a" }}>NER</span></span>
              </Link>
            </div>

            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
              {tab === "login" ? "Welcome back" : "Create an account"}
            </h1>
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 24 }}>
              {tab === "login" ? "Sign in to your LandGuardNER account" : "Get free access + auto SMS landslide alerts"}
            </p>

            {/* Sign In / Create Account tabs */}
            <div style={{ display: "flex", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 11, padding: 4, marginBottom: 22 }}>
              {(["login", "signup"] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setFormErr(""); resolvedEmailRef.current = null; }} style={{
                  flex: 1, padding: "8px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                  background: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
                  color: tab === t ? "white" : "#52525b", transition: "all 0.15s",
                }}>
                  {t === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            {/* Error from URL params */}
            {error && (
              <div style={{ ...S.err, marginBottom: 18 }}>
                <span>⚠️</span><span>{decodeURIComponent(error)}</span>
              </div>
            )}

            {/* Client error */}
            {formError && (
              <div style={{ ...S.err, marginBottom: 18 }}>
                <span>⚠️</span><span>{formError}</span>
              </div>
            )}

            {/* SMS alert info */}
            {tab === "signup" && (
              <div style={{ marginBottom: 18, display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "#71717a" }}>
                <span>📱</span>
                <span>Your phone number enables <strong style={{ color: "white" }}>automatic landslide alerts</strong> — even offline via Background Sync SMS.</span>
              </div>
            )}

            {/* ── LOGIN form ─────────────────────────────── */}
            {tab === "login" && (
              <>
                {/* Email / Phone login toggle */}
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  {(["email", "phone"] as const).map(m => (
                    <button key={m} onClick={() => { setLoginMode(m); setPhoneErr(""); setFormErr(""); resolvedEmailRef.current = null; }} style={{
                      flex: 1, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${loginMode === m ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                      background: loginMode === m ? "rgba(255,255,255,0.08)" : "transparent",
                      color: loginMode === m ? "white" : "#52525b", transition: "all 0.15s",
                    }}>
                      {m === "email" ? "📧 Email" : "📱 Mobile No."}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                  {/* Identifier field */}
                  {loginMode === "email" ? (
                    <div>
                      <label style={S.label}>Email address</label>
                      <input name="email" type="email" required placeholder="officer@ndma.gov.in" style={S.input} />
                    </div>
                  ) : (
                    <div>
                      <label style={S.label}>
                        Mobile number
                        {lookingUp && <span style={{ marginLeft: 8, fontSize: 10, color: "#52525b" }}>Looking up…</span>}
                        {!lookingUp && resolvedEmailRef.current && <span style={{ marginLeft: 8, fontSize: 10, color: "#86efac" }}>✓ Account found</span>}
                      </label>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#71717a", fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>+91</span>
                        <input name="phone_login" type="tel" required placeholder="98765 43210" inputMode="numeric" maxLength={12} onBlur={handlePhoneBlur} onChange={() => { resolvedEmailRef.current = null; setPhoneErr(""); }}
                          style={{ ...S.input, paddingLeft: 48, borderColor: phoneError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.12)" }} />
                      </div>
                      {phoneError && <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 5 }}>{phoneError}</p>}
                      <p style={{ fontSize: 11, color: "#3f3f46", marginTop: 5 }}>We find your email automatically from your phone number</p>
                    </div>
                  )}

                  {/* Password */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <label style={{ ...S.label, marginBottom: 0 }}>Password</label>
                      <button type="button" onClick={() => setForgot(true)} style={{ fontSize: 12, color: "#71717a", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationStyle: "dotted" }}>
                        Forgot password?
                      </button>
                    </div>
                    <div style={{ position: "relative" }}>
                      <input name="password" type={showPw ? "text" : "password"} required placeholder="••••••••" style={{ ...S.input, paddingRight: 44 }} />
                      <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14 }}>
                        {showPw ? "🙈" : "👁"}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading || !!phoneError} style={loading || !!phoneError ? S.btnDim : S.btnWht}>
                    {loading ? (
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "black", animation: "spin 1s linear infinite", display: "inline-block" }} />
                        Signing in…
                      </span>
                    ) : "Sign In →"}
                  </button>
                </form>
              </>
            )}

            {/* ── SIGNUP form ────────────────────────────── */}
            {tab === "signup" && (
              <form action="/auth/action?action=signup" method="POST" style={{ display: "flex", flexDirection: "column", gap: 15 }} onSubmit={() => setLoading(true)}>
                <div>
                  <label style={S.label}>Full Name</label>
                  <input name="full_name" type="text" placeholder="Rahul Sharma" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Email address</label>
                  <input name="email" type="email" required placeholder="officer@ndma.gov.in" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Password</label>
                  <div style={{ position: "relative" }}>
                    <input name="password" type={showPw ? "text" : "password"} required placeholder="••••••••" minLength={6} style={{ ...S.input, paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14 }}>
                      {showPw ? "🙈" : "👁"}
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: "#3f3f46", marginTop: 5 }}>Minimum 6 characters</p>
                </div>
                <div>
                  <label style={S.label}>
                    Mobile Number
                    <span style={{ marginLeft: 8, fontSize: 10, color: "#71717a", fontWeight: 400 }}>📱 For SMS alerts</span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#71717a", fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>+91</span>
                    <input name="phone_number" type="tel" placeholder="98765 43210" inputMode="numeric" maxLength={12} style={{ ...S.input, paddingLeft: 48 }} />
                  </div>
                  <p style={{ fontSize: 11, color: "#3f3f46", marginTop: 5 }}>Indian mobile · Used only for disaster alerts · Never shared</p>
                </div>
                <div>
                  <label style={S.label}>State / Region</label>
                  <select name="state_code" style={{ ...S.input, cursor: "pointer" }}>
                    <option value="">— Select your state —</option>
                    {[["AS","Assam"],["AR","Arunachal Pradesh"],["ML","Meghalaya"],["MN","Manipur"],["MZ","Mizoram"],["NL","Nagaland"],["TR","Tripura"],["SK","Sikkim"],["OTHER","Other"]].map(([v,l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={loading} style={loading ? S.btnDim : S.btnWht}>
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "black", animation: "spin 1s linear infinite", display: "inline-block" }} />
                      Creating account…
                    </span>
                  ) : "Create Account + Enable SMS Alerts →"}
                </button>
              </form>
            )}

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              <span style={{ fontSize: 11, color: "#3f3f46" }}>or browse without signing in</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            </div>

            {/* Quick access */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
              {[["/map","🗺️","Live Map"],["/alerts","🔔","Alerts"],["/shelter","🏠","Shelters"],["/report","📸","Report"]].map(([href, icon, label]) => (
                <Link key={href} href={href} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)", color: "#71717a", textDecoration: "none", fontSize: 12, fontWeight: 500 }}>
                  <span>{icon}</span><span>{label}</span>
                </Link>
              ))}
            </div>

            {/* Emergency helplines */}
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "#080808", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#3f3f46", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>🆘 Emergency Helplines</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[["NDMA","1078"],["NDRF","01123438252"],["Police","100"]].map(([n, num]) => (
                  <a key={n} href={`tel:${num}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#71717a" }}>{n}</span>
                    <span style={{ fontSize: 10, fontFamily: "monospace", color: "white" }}>{num}</span>
                  </a>
                ))}
              </div>
            </div>

            <p style={{ textAlign: "center", fontSize: 11, color: "#27272a", marginTop: 20 }}>Authorized personnel only · MDoNER · SIH 2026</p>
          </div>
        </div>

        <style>{`
          @keyframes spin   { to { transform: rotate(360deg); } }
          @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:.4} }
          input { color-scheme: dark; }
          input::placeholder { color: #3f3f46; }
          select { color-scheme: dark; }
          select option { background: #111; }
          .hidden-mobile { display: flex; flex-direction: column; }
          .mobile-only   { display: none; }
          @media (max-width: 1024px) {
            .hidden-mobile { display: none !important; }
            .mobile-only   { display: block !important; }
          }
        `}</style>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "black", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "white", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

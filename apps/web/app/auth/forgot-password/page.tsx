"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "input" | "sent" | "error";

export default function ForgotPasswordPage() {
  const [mode, setMode]         = useState<Mode>("input");
  const [inputType, setInputType] = useState<"email" | "phone">("email");
  const [value, setValue]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [errMsg, setErrMsg]     = useState("");
  const [sentTo, setSentTo]     = useState("");

  const supabase = createClient();

  const normalisePhone = (p: string) => {
    const d = p.replace(/\D/g, "");
    if (d.length === 10) return `+91${d}`;
    if (d.length === 12 && d.startsWith("91")) return `+${d}`;
    return d.length >= 10 ? `+91${d.slice(-10)}` : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrMsg("");

    try {
      let email = value.trim();

      // Phone → look up email first
      if (inputType === "phone") {
        const phone = normalisePhone(value);
        if (!phone) { setErrMsg("Enter a valid 10-digit Indian mobile number."); setLoading(false); return; }

        const res = await fetch(`/api/auth/phone-lookup?phone=${encodeURIComponent(phone)}`);
        const data = await res.json();

        if (!res.ok || !data.email) {
          setErrMsg(data.error ?? "No account found with this phone number.");
          setLoading(false);
          return;
        }
        email = data.email;
      }

      if (!email || !email.includes("@")) {
        setErrMsg("Enter a valid email address.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        setErrMsg(error.message);
        setLoading(false);
        return;
      }

      setSentTo(email);
      setMode("sent");
    } catch {
      setErrMsg("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif", position: "relative" }}>

      {/* Grid background */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "50px 50px", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 28 }}>🏔️</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "white" }}>LandGuard<span style={{ color: "#71717a" }}>NER</span></span>
          </Link>
        </div>

        {mode === "sent" ? (
          /* ── Success state ─────────────────────────────────────── */
          <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 40, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 24 }}>
              📧
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, color: "white" }}>Check your email</h1>
            <p style={{ fontSize: 14, color: "#71717a", lineHeight: 1.7, marginBottom: 8 }}>
              We sent a password reset link to
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "white", background: "rgba(255,255,255,0.06)", padding: "8px 16px", borderRadius: 8, marginBottom: 24, wordBreak: "break-all" }}>
              {sentTo}
            </p>
            <p style={{ fontSize: 12, color: "#52525b", lineHeight: 1.6, marginBottom: 32 }}>
              Click the link in the email to reset your password. The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => { setMode("input"); setValue(""); }} style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#a1a1aa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Try a different email / phone
              </button>
              <Link href="/auth/login" style={{ display: "block", textAlign: "center", padding: "12px", borderRadius: 10, background: "white", color: "black", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          /* ── Input state ───────────────────────────────────────── */
          <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 40 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: "white" }}>Forgot password?</h1>
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 28, lineHeight: 1.6 }}>
              Enter your registered email or mobile number. We'll send a reset link to your email.
            </p>

            {/* Email / Phone toggle */}
            <div style={{ display: "flex", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 4, marginBottom: 24 }}>
              {(["email", "phone"] as const).map((t) => (
                <button key={t} onClick={() => { setInputType(t); setValue(""); setErrMsg(""); }} style={{
                  flex: 1, padding: "8px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                  background: inputType === t ? "rgba(255,255,255,0.12)" : "transparent",
                  color: inputType === t ? "white" : "#52525b", transition: "all 0.15s",
                }}>
                  {t === "email" ? "📧 Email" : "📱 Mobile"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {inputType === "email" ? (
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>Email address</label>
                  <input
                    type="email"
                    required
                    placeholder="officer@ndma.gov.in"
                    value={value}
                    onChange={e => { setValue(e.target.value); setErrMsg(""); }}
                    style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "white", outline: "none", fontFamily: "inherit" }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>Mobile number</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#71717a", fontSize: 14, fontWeight: 600, pointerEvents: "none" }}>+91</span>
                    <input
                      type="tel"
                      required
                      placeholder="98765 43210"
                      inputMode="numeric"
                      maxLength={12}
                      value={value}
                      onChange={e => { setValue(e.target.value); setErrMsg(""); }}
                      style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 14px 12px 48px", fontSize: 14, color: "white", outline: "none", fontFamily: "inherit" }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: "#3f3f46", marginTop: 6 }}>We'll find your account and send the reset link to your registered email.</p>
                </div>
              )}

              {/* Error */}
              {errMsg && (
                <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,100,100,0.2)", fontSize: 13, color: "#fca5a5" }}>
                  <span>⚠️</span><span>{errMsg}</span>
                </div>
              )}

              <button type="submit" disabled={loading || !value} style={{
                width: "100%", padding: "13px", borderRadius: 10, border: "none",
                background: loading || !value ? "#1a1a1a" : "white",
                color: loading || !value ? "#52525b" : "black",
                fontWeight: 700, fontSize: 14, cursor: loading || !value ? "not-allowed" : "pointer", transition: "all 0.15s",
              }}>
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "black", animation: "spin 1s linear infinite", display: "inline-block" }} />
                    Sending reset link…
                  </span>
                ) : "Send Reset Link →"}
              </button>
            </form>

            <div style={{ marginTop: 24, textAlign: "center" }}>
              <Link href="/auth/login" style={{ fontSize: 13, color: "#52525b", textDecoration: "none" }}>
                ← Back to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Emergency strip */}
        <div style={{ marginTop: 24, padding: "14px 16px", borderRadius: 12, background: "#080808", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-around" }}>
          {[["NDMA", "1078"], ["NDRF", "01123438252"], ["Police", "100"]].map(([n, num]) => (
            <a key={n} href={`tel:${num}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none" }}>
              <span style={{ fontSize: 10, color: "#52525b", fontWeight: 600 }}>{n}</span>
              <span style={{ fontSize: 11, color: "white", fontFamily: "monospace" }}>{num}</span>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input { color-scheme: dark; }
        input::placeholder { color: #3f3f46; }
      `}</style>
    </div>
  );
}

"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Stage = "loading" | "form" | "success" | "error";

function ResetForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [stage, setStage]       = useState<Stage>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [errMsg, setErrMsg]     = useState("");
  const [showPw, setShowPw]     = useState(false);

  const strength = (() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#ef4444", "#f97316", "#eab308", "#22c55e"][strength];

  // Exchange the hash fragment tokens that Supabase puts in the URL
  useEffect(() => {
    const type = searchParams.get("type");
    // Supabase sends ?type=recovery with the access_token in the URL hash
    if (type === "recovery") {
      // The client SDK will exchange tokens automatically on page load when using PKCE
      supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          setStage("form");
        }
      });
    } else {
      // Try to get session — if the hash has been exchanged already
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setStage("form");
        } else {
          // Wait a tick for hash exchange
          setTimeout(() => {
            supabase.auth.getSession().then(({ data: d }) => {
              setStage(d.session ? "form" : "error");
            });
          }, 1000);
        }
      });
    }
  }, [searchParams]); // eslint-disable-line

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setErrMsg("Passwords do not match."); return; }
    if (password.length < 8)  { setErrMsg("Password must be at least 8 characters."); return; }

    setLoading(true);
    setErrMsg("");

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrMsg(error.message);
      setLoading(false);
      return;
    }

    setStage("success");
    setTimeout(() => router.push("/dashboard"), 2500);
  };

  if (stage === "loading") {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "white", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "#52525b", fontSize: 14 }}>Verifying reset link…</p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>🔗</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Link expired or invalid</h2>
        <p style={{ fontSize: 13, color: "#71717a", lineHeight: 1.7, marginBottom: 28 }}>
          This password reset link has expired or was already used. Reset links are valid for 1 hour.
        </p>
        <Link href="/auth/forgot-password" style={{ display: "block", padding: "12px 24px", borderRadius: 10, background: "white", color: "black", fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 12 }}>
          Request a New Link
        </Link>
        <Link href="/auth/login" style={{ display: "block", padding: "12px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", color: "#a1a1aa", fontSize: 14, textDecoration: "none" }}>
          Back to Sign In
        </Link>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 40, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Password updated!</h2>
        <p style={{ fontSize: 13, color: "#71717a", lineHeight: 1.6 }}>
          Your password has been changed. Redirecting you to the dashboard…
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 40 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Set new password</h1>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: 28, lineHeight: 1.6 }}>
        Choose a strong new password for your account.
      </p>

      <form onSubmit={handleReset} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* New password */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>New Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setErrMsg(""); }}
              style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 44px 12px 14px", fontSize: 14, color: "white", outline: "none", fontFamily: "inherit" }}
            />
            <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 14 }}>
              {showPw ? "🙈" : "👁"}
            </button>
          </div>

          {/* Strength bar */}
          {password.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength ? strengthColor : "#1f1f1f", transition: "background 0.3s" }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</span>
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { label: "8+ chars", ok: password.length >= 8 },
              { label: "Uppercase", ok: /[A-Z]/.test(password) },
              { label: "Number", ok: /[0-9]/.test(password) },
              { label: "Symbol", ok: /[^A-Za-z0-9]/.test(password) },
            ].map(({ label, ok }) => (
              <span key={label} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, border: `1px solid ${ok ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`, color: ok ? "#86efac" : "#52525b", transition: "all 0.2s" }}>
                {ok ? "✓" : "○"} {label}
              </span>
            ))}
          </div>
        </div>

        {/* Confirm */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#a1a1aa", marginBottom: 8 }}>Confirm Password</label>
          <input
            type={showPw ? "text" : "password"}
            required
            placeholder="Re-enter your password"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setErrMsg(""); }}
            style={{ width: "100%", background: "#111", border: `1px solid ${confirm && confirm !== password ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: "white", outline: "none", fontFamily: "inherit" }}
          />
          {confirm && confirm !== password && (
            <p style={{ fontSize: 11, color: "#fca5a5", marginTop: 5 }}>Passwords don't match</p>
          )}
        </div>

        {errMsg && (
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 13, color: "#fca5a5" }}>
            <span>⚠️</span><span>{errMsg}</span>
          </div>
        )}

        <button type="submit" disabled={loading || password !== confirm || password.length < 8} style={{
          width: "100%", padding: "13px", borderRadius: 10, border: "none",
          background: (loading || password !== confirm || password.length < 8) ? "#1a1a1a" : "white",
          color: (loading || password !== confirm || password.length < 8) ? "#52525b" : "black",
          fontWeight: 700, fontSize: 14, cursor: "pointer", transition: "all 0.15s",
        }}>
          {loading ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "black", animation: "spin 1s linear infinite", display: "inline-block" }} />
              Updating password…
            </span>
          ) : "Set New Password →"}
        </button>
      </form>

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/auth/login" style={{ fontSize: 13, color: "#52525b", textDecoration: "none" }}>← Back to Sign In</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", backgroundSize: "50px 50px", pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 28 }}>🏔️</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "white" }}>LandGuard<span style={{ color: "#71717a" }}>NER</span></span>
          </Link>
        </div>

        <Suspense fallback={
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "white", animation: "spin 1s linear infinite", margin: "0 auto" }} />
          </div>
        }>
          <ResetForm />
        </Suspense>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input { color-scheme: dark; }
        input::placeholder { color: #3f3f46; }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase's recovery link lands here with the session tokens in the URL
  // hash; the client SDK auto-detects them (detectSessionInUrl) and fires
  // a PASSWORD_RECOVERY auth event once the transient session is ready.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let settled = false;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashErrorDesc = hash.get("error_description");
    if (hashErrorDesc) {
      setLinkError(hashErrorDesc.replace(/\+/g, " "));
      setReady(true);
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        settled = true;
        setReady(true);
      }
    });

    const timer = setTimeout(async () => {
      if (settled) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setLinkError("This link is invalid or has expired. Request a new one.");
        setReady(true);
      }
    }, 1500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || "Something went wrong. Try again.");
        return;
      }
      // Clear the transient recovery session — the app's real session lives
      // in HttpOnly cookies set by /api/auth/login, not this browser client.
      await supabase.auth.signOut();
      setDone(true);
      setTimeout(() => router.push("/login?reset=success"), 2000);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--bg-page)" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl mb-4 shadow-sm"
            style={{ background: "var(--acc-bg)", border: "1px solid var(--bdr)" }}
          >
            🎙
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--txt-1)" }}>
            Podcast Insights
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--txt-3)" }}>
            Choose a new password
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-7"
          style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
        >
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
            </div>
          ) : done ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-3xl">✅</div>
              <p className="text-sm font-medium" style={{ color: "var(--txt-1)" }}>
                Password updated
              </p>
              <p className="text-sm" style={{ color: "var(--txt-3)" }}>
                Redirecting you to sign in…
              </p>
            </div>
          ) : linkError ? (
            <div className="text-center py-4 space-y-3">
              <p
                className="text-sm px-3 py-2 rounded-lg"
                style={{
                  color: "#F87171",
                  background: "rgba(127,29,29,0.25)",
                  border: "1px solid rgba(185,28,28,0.3)",
                }}
              >
                {linkError}
              </p>
              <Link
                href="/forgot-password"
                className="inline-block mt-2 text-sm font-medium hover:underline"
                style={{ color: "var(--acc)" }}
              >
                Request a new link →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>
                  New password <span style={{ color: "var(--txt-4)" }}>(min 8 characters)</span>
                </label>
                <div className="input flex items-center gap-2.5" style={{ padding: "0 0.75rem" }}>
                  <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--txt-4)" }} />
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    autoFocus
                    minLength={8}
                    className="flex-1 bg-transparent outline-none py-2 text-sm"
                    style={{ color: "var(--txt-1)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="shrink-0"
                    style={{ color: "var(--txt-4)" }}
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>
                  Confirm new password
                </label>
                <div className="input flex items-center gap-2.5" style={{ padding: "0 0.75rem" }}>
                  <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--txt-4)" }} />
                  <input
                    type={show ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    minLength={8}
                    className="flex-1 bg-transparent outline-none py-2 text-sm"
                    style={{ color: "var(--txt-1)" }}
                  />
                </div>
              </div>

              {error && (
                <p
                  className="text-sm px-3 py-2 rounded-lg"
                  style={{
                    color: "#F87171",
                    background: "rgba(127,29,29,0.25)",
                    border: "1px solid rgba(185,28,28,0.3)",
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 text-white mt-1"
                style={{ background: "var(--acc)" }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

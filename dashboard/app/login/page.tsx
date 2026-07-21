"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  // Default to /dashboard (not /podcasts) — it's the only page that checks
  // for zero subscriptions and redirects first-time users to /onboarding.
  const from = searchParams.get("from") ?? "/dashboard";
  const justReset = searchParams.get("reset") === "success";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        // Full navigation so the middleware sees the new session cookie
        window.location.href = from;
      } else {
        const data = await res.json();
        setError(data.error ?? "Invalid email or password");
      }
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
            Sign in to manage your podcasts
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-7"
          style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {justReset && (
              <p
                className="text-sm px-3 py-2 rounded-lg"
                style={{
                  color: "#4ADE80",
                  background: "rgba(20,83,45,0.25)",
                  border: "1px solid rgba(21,128,61,0.3)",
                }}
              >
                Password updated. Sign in with your new password.
              </p>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>
                Email
              </label>
              <div className="input flex items-center gap-2.5" style={{ padding: "0 0.75rem" }}>
                <Mail className="w-4 h-4 shrink-0" style={{ color: "var(--txt-4)" }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="flex-1 bg-transparent outline-none py-2 text-sm"
                  style={{ color: "var(--txt-1)" }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--acc)" }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="input flex items-center gap-2.5" style={{ padding: "0 0.75rem" }}>
                <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--txt-4)" }} />
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
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
              disabled={loading || !email || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 text-white mt-1"
              style={{ background: "var(--acc)" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--txt-4)" }}>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium hover:underline"
            style={{ color: "var(--acc)" }}
          >
            Create one
          </Link>
        </p>
        <p className="text-center text-xs mt-3" style={{ color: "var(--txt-4)" }}>
          The insights dashboard is publicly accessible.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

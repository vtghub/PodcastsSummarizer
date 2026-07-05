"use client";

import { useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/podcasts";

  const [passcode, setPasscode] = useState("");
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
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        window.location.href = from;
      } else {
        const data = await res.json();
        setError(data.error ?? "Invalid passcode");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: "var(--bg-page)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎙</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--txt-1)" }}>
            Podcast Insights
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
            Enter your passcode to manage podcasts
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-6 shadow-sm"
             style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}>
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4" style={{ color: "var(--acc)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--txt-2)" }}>
              Restricted access
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                required
                autoFocus
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--txt-4)" }}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm px-3 py-2 rounded-lg"
                 style={{ color: "#F87171", background: "rgba(127,29,29,0.25)", border: "1px solid rgba(185,28,28,0.3)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !passcode}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 text-white"
              style={{ background: "var(--acc)" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Verifying…" : "Access My Podcasts"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "var(--txt-4)" }}>
          The main dashboard is publicly accessible.
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

"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Show the same success state regardless of whether the email is
      // registered — avoids leaking which addresses have accounts.
      if (error) {
        setError(error.message || "Something went wrong. Try again.");
      } else {
        setSent(true);
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
            Reset your password
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-7"
          style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
        >
          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-3xl">✉️</div>
              <p className="text-sm font-medium" style={{ color: "var(--txt-1)" }}>
                Check your inbox
              </p>
              <p className="text-sm" style={{ color: "var(--txt-3)" }}>
                If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
              </p>
              <Link
                href="/login"
                className="inline-block mt-2 text-sm font-medium hover:underline"
                style={{ color: "var(--acc)" }}
              >
                Back to sign in →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm" style={{ color: "var(--txt-3)" }}>
                Enter the email address on your account and we&apos;ll send you a link to reset your password.
              </p>

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
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-50 text-white mt-1"
                style={{ background: "var(--acc)" }}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
        </div>

        {!sent && (
          <p className="text-center text-sm mt-5" style={{ color: "var(--txt-4)" }}>
            Remembered your password?{" "}
            <Link
              href="/login"
              className="font-medium hover:underline"
              style={{ color: "var(--acc)" }}
            >
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

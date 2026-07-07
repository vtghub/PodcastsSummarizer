"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { DOMAINS, getDomainColor } from "@/lib/domain-colors";

const UTC_HOURS = Array.from({ length: 24 }, (_, i) => i);

function utcHourLabel(h: number) {
  const date = new Date();
  date.setUTCHours(h, 0, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
}

export default function ProfileForm({
  initialDisplayName,
  initialDigestEnabled,
  initialDigestHour,
  initialDigestDomains,
}: {
  initialDisplayName: string;
  initialDigestEnabled: boolean;
  initialDigestHour: number;
  initialDigestDomains: string[] | null;
}) {
  const router = useRouter();
  const [displayName, setDisplayName]         = useState(initialDisplayName);
  const [digestEnabled, setDigestEnabled]     = useState(initialDigestEnabled);
  const [digestHour, setDigestHour]           = useState(initialDigestHour);
  const [digestDomains, setDigestDomains]     = useState<string[] | null>(initialDigestDomains);
  const [saving, setSaving]                   = useState(false);
  const [saved, setSaved]                     = useState(false);
  const [error, setError]                     = useState("");

  function toggleDomain(domain: string) {
    setDigestDomains((prev) => {
      const current = prev ?? DOMAINS;
      if (current.includes(domain)) {
        const next = current.filter((d) => d !== domain);
        return next.length === DOMAINS.length ? null : next.length === 0 ? [domain] : next;
      }
      const next = [...current, domain];
      return next.length === DOMAINS.length ? null : next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, digest_enabled: digestEnabled, digest_hour: digestHour, digest_domains: digestDomains }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Account card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>Account</h2>
        </div>
        <div className="p-5 space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="input"
          />
          <p className="text-xs pt-0.5" style={{ color: "var(--txt-4)" }}>
            Shown in the navbar when you&apos;re signed in.
          </p>
        </div>
      </div>

      {/* Daily Digest card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>Daily Digest</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Toggle row */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--txt-1)" }}>Email digest</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--txt-4)" }}>
                Receive a daily summary of your subscribed podcasts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDigestEnabled((v) => !v)}
              className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
              style={{ background: digestEnabled ? "var(--acc)" : "var(--bdr-hov)" }}
              aria-pressed={digestEnabled}
            >
              <span
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ left: digestEnabled ? "calc(100% - 1.25rem)" : "0.25rem" }}
              />
            </button>
          </div>

          {/* Hour picker + domain filter */}
          {digestEnabled && (
            <div className="space-y-4 pt-1 border-t" style={{ borderColor: "var(--bdr)" }}>
              <div className="space-y-1.5 pt-3">
                <label className="text-xs font-medium block" style={{ color: "var(--txt-3)" }}>Send time (your local time)</label>
                <select
                  value={digestHour}
                  onChange={(e) => setDigestHour(Number(e.target.value))}
                  className="input"
                >
                  {UTC_HOURS.map((h) => (
                    <option key={h} value={h}>{utcHourLabel(h)}</option>
                  ))}
                </select>
                <p className="text-xs" style={{ color: "var(--txt-4)" }}>
                  The pipeline runs once daily — your digest arrives after that run completes.
                </p>
              </div>

              {/* Domain filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Email domains</label>
                  <button
                    type="button"
                    onClick={() => setDigestDomains(null)}
                    className="text-xs underline"
                    style={{ color: digestDomains === null ? "var(--acc)" : "var(--txt-4)" }}
                  >
                    All domains
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DOMAINS.map((domain) => {
                    const active = digestDomains === null || digestDomains.includes(domain);
                    const colors = getDomainColor(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => toggleDomain(domain)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${colors.bg} ${colors.text} ${colors.border}`}
                        style={{ opacity: active ? 1 : 0.35 }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {domain}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs" style={{ color: "var(--txt-4)" }}>
                  {digestDomains === null
                    ? "All domains included in your digest."
                    : `Only ${digestDomains.length} domain${digestDomains.length !== 1 ? "s" : ""} included.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p
          className="text-sm px-4 py-3 rounded-xl"
          style={{ color: "#F87171", background: "rgba(127,29,29,0.25)", border: "1px solid rgba(185,28,28,0.3)" }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 text-white transition-opacity"
          style={{ background: "var(--acc)" }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "#34D399" }}>
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

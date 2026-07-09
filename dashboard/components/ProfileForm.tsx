"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { DOMAINS, getDomainColor } from "@/lib/domain-colors";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// 0=Monday … 6=Sunday (Python weekday convention, matches the worker)
const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Common IANA timezones grouped for the picker
const TIMEZONES: { label: string; value: string }[] = [
  { label: "Eastern Time (ET)",        value: "America/New_York" },
  { label: "Central Time (CT)",        value: "America/Chicago" },
  { label: "Mountain Time (MT)",       value: "America/Denver" },
  { label: "Pacific Time (PT)",        value: "America/Los_Angeles" },
  { label: "Alaska Time (AKT)",        value: "America/Anchorage" },
  { label: "Hawaii Time (HST)",        value: "Pacific/Honolulu" },
  { label: "UTC",                      value: "UTC" },
  { label: "London (GMT/BST)",         value: "Europe/London" },
  { label: "Paris / Berlin (CET)",     value: "Europe/Paris" },
  { label: "Dubai (GST)",              value: "Asia/Dubai" },
  { label: "India (IST)",              value: "Asia/Kolkata" },
  { label: "Singapore / HK (SGT)",     value: "Asia/Singapore" },
  { label: "Tokyo (JST)",              value: "Asia/Tokyo" },
  { label: "Sydney (AEST)",            value: "Australia/Sydney" },
];

function hourLabel(h: number, tz: string) {
  try {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setHours(h);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: tz,
    });
  } catch {
    return `${h}:00`;
  }
}

export default function ProfileForm({
  initialDisplayName,
  initialDigestEnabled,
  initialDigestHour,
  initialDigestDomains,
  initialDigestFrequency,
  initialDigestDayOfWeek,
  initialDigestTimezone,
}: {
  initialDisplayName: string;
  initialDigestEnabled: boolean;
  initialDigestHour: number;
  initialDigestDomains: string[] | null;
  initialDigestFrequency: "daily" | "weekly";
  initialDigestDayOfWeek: number;
  initialDigestTimezone: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName]           = useState(initialDisplayName);
  const [digestEnabled, setDigestEnabled]       = useState(initialDigestEnabled);
  const [digestHour, setDigestHour]             = useState(initialDigestHour);
  const [digestDomains, setDigestDomains]       = useState<string[] | null>(initialDigestDomains);
  const [digestFrequency, setDigestFrequency]   = useState<"daily" | "weekly">(initialDigestFrequency);
  const [digestDayOfWeek, setDigestDayOfWeek]   = useState(initialDigestDayOfWeek);
  const [digestTimezone, setDigestTimezone]     = useState(initialDigestTimezone);
  const [saving, setSaving]                     = useState(false);
  const [saved, setSaved]                       = useState(false);
  const [error, setError]                       = useState("");

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
        body: JSON.stringify({
          display_name: displayName,
          digest_enabled: digestEnabled,
          digest_hour: digestHour,
          digest_domains: digestDomains,
          digest_frequency: digestFrequency,
          digest_day_of_week: digestDayOfWeek,
          digest_timezone: digestTimezone,
        }),
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

      {/* Digest settings card */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>Email Digest</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Enable toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--txt-1)" }}>Email digest</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--txt-4)" }}>
                Receive a summary of your subscribed podcasts by email.
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

          {digestEnabled && (
            <div className="space-y-4 pt-1 border-t" style={{ borderColor: "var(--bdr)" }}>

              {/* Frequency: Daily / Weekly */}
              <div className="space-y-1.5 pt-3">
                <label className="text-xs font-medium block" style={{ color: "var(--txt-3)" }}>Frequency</label>
                <div className="flex gap-2">
                  {(["daily", "weekly"] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setDigestFrequency(freq)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium border transition-all"
                      style={{
                        background: digestFrequency === freq ? "var(--acc)" : "var(--bg-elevated)",
                        color: digestFrequency === freq ? "white" : "var(--txt-3)",
                        borderColor: digestFrequency === freq ? "var(--acc)" : "var(--bdr)",
                      }}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Day of week — only for weekly */}
              {digestFrequency === "weekly" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium block" style={{ color: "var(--txt-3)" }}>Send on</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setDigestDayOfWeek(idx)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                        style={{
                          background: digestDayOfWeek === idx ? "var(--acc)" : "var(--bg-elevated)",
                          color: digestDayOfWeek === idx ? "white" : "var(--txt-3)",
                          borderColor: digestDayOfWeek === idx ? "var(--acc)" : "var(--bdr)",
                        }}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: "var(--txt-4)" }}>
                    Your digest will include insights from the past 7 days.
                  </p>
                </div>
              )}

              {/* Timezone */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium block" style={{ color: "var(--txt-3)" }}>Timezone</label>
                <select
                  value={digestTimezone}
                  onChange={(e) => setDigestTimezone(e.target.value)}
                  className="input"
                >
                  {TIMEZONES.map(({ label, value }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Send time */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium block" style={{ color: "var(--txt-3)" }}>Send time</label>
                <select
                  value={digestHour}
                  onChange={(e) => setDigestHour(Number(e.target.value))}
                  className="input"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{hourLabel(h, digestTimezone)}</option>
                  ))}
                </select>
                <p className="text-xs" style={{ color: "var(--txt-4)" }}>
                  Times shown in your selected timezone. Digest emails go out within the hour after ingestion completes.
                </p>
              </div>

              {/* Domain filter */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Email domains</label>
                  <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                    {digestDomains === null
                      ? "All included"
                      : `${digestDomains.length} of ${DOMAINS.length} included`}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {/* All chip */}
                  <button
                    type="button"
                    onClick={() => setDigestDomains(null)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border font-medium transition-all"
                    style={digestDomains === null
                      ? { background: "var(--acc)", color: "#fff", borderColor: "var(--acc)" }
                      : { background: "var(--bg-elevated)", color: "var(--txt-4)", borderColor: "var(--bdr)" }}
                  >
                    {digestDomains === null && <Check className="w-3 h-3" />}
                    All
                  </button>
                  {DOMAINS.map((domain) => {
                    const active = digestDomains === null || digestDomains.includes(domain);
                    const colors = getDomainColor(domain);
                    return (
                      <button
                        key={domain}
                        type="button"
                        onClick={() => toggleDomain(domain)}
                        className={`flex-shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border font-medium transition-all ${
                          active ? `${colors.bg} ${colors.text} ${colors.border}` : ""
                        }`}
                        style={active ? {} : {
                          background: "var(--bg-elevated)",
                          color: "var(--txt-4)",
                          borderColor: "var(--bdr)",
                          textDecoration: "line-through",
                          opacity: 0.6,
                        }}
                        title={active ? `Remove ${domain} from digest` : `Add ${domain} to digest`}
                      >
                        {active
                          ? <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                          : <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current opacity-30" />}
                        {domain}
                      </button>
                    );
                  })}
                </div>
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

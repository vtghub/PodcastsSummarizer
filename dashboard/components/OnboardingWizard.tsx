"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import type { Source } from "@/lib/db";
import type { PodcastSearchResult } from "@/app/api/podcasts/search/route";

const DOMAINS = [
  "Technology & AI",
  "Business & Startups",
  "Health & Science",
  "Finance & Investing",
  "Leadership & Productivity",
  "Society & Culture",
  "General",
  "Other",
];

const DOMAIN_EMOJI: Record<string, string> = {
  "Technology & AI": "💻",
  "Business & Startups": "🚀",
  "Health & Science": "🧬",
  "Finance & Investing": "📈",
  "Leadership & Productivity": "🏆",
  "Society & Culture": "🌍",
  "General": "🎙",
  "Other": "✨",
};

type Step = "domains" | "recommendations" | "subscribe";

interface RecommendationResult {
  catalog: Source[];
  suggestions: PodcastSearchResult[];
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("domains");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [recs, setRecs] = useState<RecommendationResult>({ catalog: [], suggestions: [] });
  const [pendingSubs, setPendingSubs] = useState<Set<string>>(new Set());
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  function toggleDomain(d: string) {
    setSelectedDomains((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  }

  function toggleSub(id: string) {
    setPendingSubs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function goToRecommendations() {
    if (selectedDomains.length === 0) return;
    setLoadingRecs(true);
    setError("");
    try {
      const res = await fetch(
        `/api/recommendations/podcasts?domains=${encodeURIComponent(selectedDomains.join(","))}`
      );
      const data: RecommendationResult = await res.json();
      setRecs(data);
      // Pre-select all catalog podcasts in selected domains
      const preSelected = new Set(data.catalog.map((s) => s.id));
      setPendingSubs(preSelected);
      setStep("recommendations");
    } catch {
      setError("Failed to load recommendations. Try again.");
    } finally {
      setLoadingRecs(false);
    }
  }

  async function finish() {
    setFinishing(true);
    setError("");
    try {
      // Subscribe to selected podcasts
      await Promise.allSettled(
        Array.from(pendingSubs).map((sourceId) =>
          fetch("/api/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceId }),
          })
        )
      );
      // Save selected domains to profile
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_domains: selectedDomains }),
      });
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Try again.");
      setFinishing(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-start justify-center px-4 py-12"
      style={{ background: "var(--bg-page)" }}
    >
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "var(--acc-bg)" }}
          >
            <Sparkles className="w-7 h-7" style={{ color: "var(--acc)" }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>
            {step === "domains" && "What are you interested in?"}
            {step === "recommendations" && "Podcasts you might love"}
            {step === "subscribe" && "You're all set!"}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "var(--txt-3)" }}>
            {step === "domains" && "Pick one or more domains to personalize your experience."}
            {step === "recommendations" && "Here's what we found for you. Toggle to subscribe."}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(["domains", "recommendations"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: step === s || (step === "recommendations" && i === 0) ? "var(--acc)" : "var(--bdr)",
                  color: step === s || (step === "recommendations" && i === 0) ? "var(--acc-txt)" : "var(--txt-3)",
                }}
              >
                {step === "recommendations" && i === 0 ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i === 0 && <div className="w-12 h-px" style={{ background: "var(--bdr)" }} />}
            </div>
          ))}
        </div>

        {/* Domain picker */}
        {step === "domains" && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {DOMAINS.map((d) => {
                const active = selectedDomains.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDomain(d)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all"
                    style={{
                      background: active ? "var(--acc-bg)" : "var(--bg-surface)",
                      borderColor: active ? "var(--acc)" : "var(--bdr)",
                      boxShadow: active ? "0 0 0 2px var(--acc)" : undefined,
                    }}
                  >
                    <span className="text-2xl">{DOMAIN_EMOJI[d]}</span>
                    <span className="text-xs font-medium leading-tight" style={{ color: active ? "var(--acc)" : "var(--txt-2)" }}>
                      {d}
                    </span>
                    {active && <Check className="w-4 h-4" style={{ color: "var(--acc)" }} />}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-sm text-center mb-4" style={{ color: "#F87171" }}>{error}</p>}

            <div className="flex justify-end">
              <button
                onClick={goToRecommendations}
                disabled={selectedDomains.length === 0 || loadingRecs}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                style={{ background: "var(--acc)", color: "#fff" }}
              >
                {loadingRecs ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loadingRecs ? "Loading…" : "Next"}
                {!loadingRecs && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Recommendations */}
        {step === "recommendations" && (
          <div>
            {recs.catalog.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-2)" }}>
                  In our catalog
                </h2>
                <div className="space-y-2">
                  {recs.catalog.map((s) => {
                    const on = pendingSubs.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-3 rounded-xl border"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{s.name}</p>
                          <p className="text-xs" style={{ color: "var(--txt-3)" }}>{s.domain}</p>
                        </div>
                        <button
                          onClick={() => toggleSub(s.id)}
                          className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: on ? "var(--acc)" : "var(--acc-bg)",
                            color: on ? "var(--acc-txt)" : "var(--acc)",
                          }}
                        >
                          {on ? "Subscribed ✓" : "Subscribe"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {recs.suggestions.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-2)" }}>
                  Discover more (from iTunes)
                </h2>
                <p className="text-xs mb-3" style={{ color: "var(--txt-4)" }}>
                  These podcasts aren't in our catalog yet — subscribing will add them for processing.
                </p>
                <div className="space-y-2">
                  {recs.suggestions.slice(0, 10).map((s) => {
                    const sid = String(s.id);
                    const on = pendingSubs.has(sid);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 p-3 rounded-xl border"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
                      >
                        {s.artworkUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{s.name}</p>
                          <p className="text-xs truncate" style={{ color: "var(--txt-3)" }}>{s.publisher}</p>
                        </div>
                        <button
                          onClick={() => toggleSub(sid)}
                          className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: on ? "var(--acc)" : "var(--acc-bg)",
                            color: on ? "var(--acc-txt)" : "var(--acc)",
                          }}
                        >
                          {on ? "Added ✓" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {recs.catalog.length === 0 && recs.suggestions.length === 0 && (
              <p className="text-center text-sm py-8" style={{ color: "var(--txt-3)" }}>
                No podcasts found for those domains yet. You can explore more in the catalog.
              </p>
            )}

            {error && <p className="text-sm text-center mb-4" style={{ color: "#F87171" }}>{error}</p>}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep("domains")}
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--txt-3)" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={finish}
                disabled={finishing}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
                style={{ background: "var(--acc)", color: "#fff" }}
              >
                {finishing && <Loader2 className="w-4 h-4 animate-spin" />}
                {finishing ? "Setting up…" : "Get Started"}
                {!finishing && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

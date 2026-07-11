"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Sparkles, RefreshCw, Loader2, ChevronRight, TrendingUp } from "lucide-react";
import { getDomainColor } from "@/lib/domain-colors";

interface TopInsight {
  index: number;
  id: string;
  date: string;
  domain: string;
  source_name: string;
  episode_title: string;
  summary: string;
}

interface TrendingSource {
  id: string;
  name: string;
  domain: string;
  insight_count: number;
}

export default function RecommendationsPage() {
  const [topInsights, setTopInsights] = useState<TopInsight[] | null>(null);
  const [trending, setTrending] = useState<TrendingSource[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/recommendations");
      const data = await res.json();
      if (res.status === 401) throw new Error("Sign in to see your personalized recommendations.");
      if (!res.ok) throw new Error(data.error ?? "Failed to load recommendations");
      setTopInsights(data.topInsights ?? []);
      setTrending(data.recommendedSources ?? []);
      setMessage(data.message ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--acc-bg)" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "var(--acc)" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "var(--txt-1)" }}>Recommendations</h1>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
          style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="text-sm mb-6 ml-12" style={{ color: "var(--txt-4)" }}>
        Your best insights from the past week, picked by AI — the same picks sent in Sunday&apos;s email, computed fresh on demand.
      </p>

      {error && <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{error}</p>}

      {loading && !topInsights && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
        </div>
      )}

      {message && (
        <p className="text-sm py-8 text-center" style={{ color: "var(--txt-3)" }}>{message}</p>
      )}

      {topInsights && topInsights.length > 0 && (
        <div className="flex flex-col gap-3 mb-8">
          {topInsights.map((ins) => {
            const colors = getDomainColor(ins.domain);
            return (
              <Link
                key={ins.id}
                href={`/dashboard?date=${ins.date}&domain=${encodeURIComponent(ins.domain)}&insight=${ins.id}`}
                className="flex flex-col gap-2 p-4 rounded-xl border transition-colors group"
                style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {ins.domain.split(" & ")[0]}
                  </span>
                  <span className="text-xs font-medium truncate" style={{ color: "var(--txt-3)" }}>{ins.source_name}</span>
                  {ins.episode_title && (
                    <span className="text-xs truncate hidden sm:inline" style={{ color: "var(--txt-4)" }}>
                      — {ins.episode_title}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-40 group-hover:opacity-100" />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--txt-1)" }}>{ins.summary}</p>
              </Link>
            );
          })}
        </div>
      )}

      {trending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--txt-3)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>Trending podcasts you&apos;re not subscribed to</h2>
          </div>
          <div className="flex flex-col gap-2">
            {trending.map((s) => {
              const colors = getDomainColor(s.domain);
              return (
                <Link
                  key={s.id}
                  href="/podcasts"
                  className="flex items-center gap-2 p-3 rounded-xl border text-sm transition-colors"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", color: "var(--txt-1)" }}
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {s.domain.split(" & ")[0]}
                  </span>
                  <span className="font-medium truncate">{s.name}</span>
                  <span className="ml-auto text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
                    {s.insight_count} insight{s.insight_count !== 1 ? "s" : ""} this week
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

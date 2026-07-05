"use client";

import { useState, useMemo } from "react";
import type { Insight } from "@/lib/db";
import { ChevronDown, ChevronUp, Quote, Zap, Tag, Volume2, VolumeX } from "lucide-react";
import { useTTS } from "@/contexts/TTSContext";
import { useSpeech } from "@/hooks/useSpeech";

interface Props {
  insight: Insight;
  domainColor: { bg: string; text: string; border: string; dot: string };
}

function buildSpeechText(insight: Insight): string {
  const parts: string[] = [];
  if (insight.episode_title) parts.push(insight.episode_title + ".");
  if (insight.summary) parts.push(insight.summary);
  if (insight.key_points.length > 0)
    parts.push("Key points: " + insight.key_points.join(". ") + ".");
  if (insight.action_items.length > 0)
    parts.push("Action items: " + insight.action_items.join(". ") + ".");
  return parts.join(" ");
}

export default function InsightCard({ insight, domainColor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { enabled: ttsEnabled } = useTTS();
  const speechText = useMemo(() => buildSpeechText(insight), [insight]);
  const { speaking, speak } = useSpeech(speechText);

  return (
    <article
      className="rounded-xl overflow-hidden border transition-colors theme-transition"
      style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--bdr-hov)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--bdr)")}
    >
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {insight.source_name && (
              <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${domainColor.text}`}>
                {insight.source_name}
              </p>
            )}
            {insight.episode_title && (
              <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: "var(--txt-2)" }}>
                {insight.episode_title}
              </p>
            )}
          </div>
          {ttsEnabled && (
            <button
              onClick={speak}
              title={speaking ? "Stop reading" : "Read aloud"}
              className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
              style={{
                background: speaking ? "var(--acc-bg)" : "transparent",
                color: speaking ? "var(--acc-txt)" : "var(--txt-4)",
                border: `1px solid ${speaking ? "var(--acc)" : "transparent"}`,
              }}
            >
              {speaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Summary */}
        <p className="text-sm leading-relaxed" style={{ color: "var(--txt-3)" }}>{insight.summary}</p>

        {/* Tags */}
        {insight.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {insight.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                style={{ background: "var(--bg-chip)", color: "var(--txt-3)", border: "1px solid var(--bdr)" }}
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Key points */}
      {insight.key_points.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--txt-4)" }}>
            Key Points
          </p>
          <ul className="space-y-1.5">
            {insight.key_points.slice(0, expanded ? undefined : 3).map((pt, i) => (
              <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--txt-2)" }}>
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${domainColor.dot}`} />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
          {insight.key_points.length > 3 && !expanded && (
            <p className="text-xs mt-1.5 ml-3.5" style={{ color: "var(--txt-4)" }}>
              +{insight.key_points.length - 3} more…
            </p>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <>
          {insight.key_quotes.length > 0 && (
            <div
              className={`mx-4 mb-4 rounded-lg border-l-2 px-4 py-3 ${domainColor.border}`}
              style={{ background: "var(--bg-quote)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "var(--txt-4)" }}>
                <Quote className="w-3 h-3" /> Quotes
              </p>
              <div className="space-y-2">
                {insight.key_quotes.map((q, i) => (
                  <p key={i} className="text-sm italic" style={{ color: "var(--txt-2)" }}>&ldquo;{q}&rdquo;</p>
                ))}
              </div>
            </div>
          )}

          {insight.action_items.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "var(--txt-4)" }}>
                <Zap className="w-3 h-3" /> Action Items
              </p>
              <ul className="space-y-1.5">
                {insight.action_items.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: "var(--txt-2)" }}>
                    <span style={{ color: "var(--txt-4)" }} className="flex-shrink-0">→</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Expand / collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t text-xs transition-colors"
        style={{
          borderColor: "var(--bdr)",
          color: "var(--txt-4)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--txt-2)";
          (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hov)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--txt-4)";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {expanded
          ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
          : <><ChevronDown className="w-3.5 h-3.5" /> Show quotes & actions</>
        }
      </button>
    </article>
  );
}

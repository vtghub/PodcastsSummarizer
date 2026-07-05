"use client";

import { useState } from "react";
import type { Insight } from "@/lib/db";
import { ChevronDown, ChevronUp, Quote, Zap, Tag } from "lucide-react";

interface Props {
  insight: Insight;
  domainColor: { bg: string; text: string; border: string; dot: string };
}

export default function InsightCard({ insight, domainColor }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        {/* Source + episode */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            {insight.source_name && (
              <p className={`text-xs font-semibold uppercase tracking-wide ${domainColor.text} mb-1`}>
                {insight.source_name}
              </p>
            )}
            {insight.episode_title && (
              <p className="text-slate-300 text-sm font-medium leading-snug line-clamp-2">
                {insight.episode_title}
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        <p className="text-slate-400 text-sm leading-relaxed">{insight.summary}</p>

        {/* Tags */}
        {insight.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {insight.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-xs"
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Key points — always visible */}
      {insight.key_points.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Key Points</p>
          <ul className="space-y-1.5">
            {insight.key_points.slice(0, expanded ? undefined : 3).map((pt, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${domainColor.dot}`} />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
          {insight.key_points.length > 3 && !expanded && (
            <p className="text-xs text-slate-500 mt-1.5 ml-3.5">
              +{insight.key_points.length - 3} more…
            </p>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Quotes */}
          {insight.key_quotes.length > 0 && (
            <div className={`mx-4 mb-4 rounded-lg border-l-2 ${domainColor.border} bg-slate-800/50 px-4 py-3`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Quote className="w-3 h-3" /> Quotes
              </p>
              <div className="space-y-2">
                {insight.key_quotes.map((q, i) => (
                  <p key={i} className="text-sm text-slate-300 italic">&ldquo;{q}&rdquo;</p>
                ))}
              </div>
            </div>
          )}

          {/* Action items */}
          {insight.action_items.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Action Items
              </p>
              <ul className="space-y-1.5">
                {insight.action_items.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-slate-500 flex-shrink-0">→</span>
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
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-slate-800 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
      >
        {expanded ? (
          <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
        ) : (
          <><ChevronDown className="w-3.5 h-3.5" /> Show quotes & actions</>
        )}
      </button>
    </article>
  );
}

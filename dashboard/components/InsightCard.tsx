"use client";

import React, { useState, useMemo } from "react";
import type { Insight, PlatformLinks } from "@/lib/db";
import { ChevronDown, ChevronUp, Quote, Zap, Tag, Volume2, VolumeX, Globe, CalendarDays } from "lucide-react";

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

function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function domainColorKey(domain: string): string {
  const map: Record<string, string> = {
    "Technology & AI": "tech",
    "Business & Startups": "biz",
    "Health & Science": "hlth",
    "Finance & Investing": "fin",
    "Leadership & Productivity": "lead",
    "Society & Culture": "soc",
  };
  return map[domain] ?? "oth";
}

export default function InsightCard({ insight, domainColor }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { enabled: ttsEnabled } = useTTS();
  const speechText = useMemo(() => buildSpeechText(insight), [insight]);
  const { speaking, speak } = useSpeech(speechText);
  const dk = domainColorKey(insight.domain ?? "");

  return (
    <article
      className="card-lift rounded-2xl overflow-hidden border flex flex-col"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--bdr)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Domain colour bar */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ background: `var(--d-${dk}-bdr)` }} />

      {/* Card header */}
      <div className="px-5 pt-4 pb-3 flex-1">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            {insight.source_name && (
              <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${domainColor.text}`}>
                {insight.source_name}
              </p>
            )}
            {insight.episode_title && (
              <h3 className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: "var(--txt-1)" }}>
                {insight.episode_title}
              </h3>
            )}
            {insight.episode_published_at && (
              <p className="flex items-center gap-1 text-xs mt-1" style={{ color: "var(--txt-4)" }}>
                <CalendarDays className="w-3 h-3 flex-shrink-0" />
                {formatPublishedDate(insight.episode_published_at)}
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: "var(--bg-chip)", color: "var(--txt-3)", border: "1px solid var(--bdr)" }}
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Platform links */}
        {insight.platform_links && Object.keys(insight.platform_links).length > 0 && (
          <PlatformLinkRow links={insight.platform_links} />
        )}
      </div>

      {/* Divider + Key points */}
      {insight.key_points.length > 0 && (
        <>
          <div className="mx-5 border-t" style={{ borderColor: "var(--bdr)" }} />
          <div className="px-5 py-3">
            <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--txt-4)" }}>
              Key Points
            </p>
            <ul className="space-y-2">
              {insight.key_points.slice(0, expanded ? undefined : 3).map((pt, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "var(--txt-2)" }}>
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: `var(--d-${dk}-dot)` }}
                  />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            {insight.key_points.length > 3 && !expanded && (
              <p className="text-xs mt-2 ml-4" style={{ color: "var(--txt-4)" }}>
                +{insight.key_points.length - 3} more…
              </p>
            )}
          </div>
        </>
      )}

      {/* Expanded: quotes + actions */}
      {expanded && (
        <>
          {insight.key_quotes.length > 0 && (
            <div
              className={`mx-4 mb-3 rounded-xl border-l-2 px-4 py-3 ${domainColor.border}`}
              style={{ background: "var(--bg-quote)" }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: "var(--txt-4)" }}>
                <Quote className="w-3 h-3" /> Quotes
              </p>
              <div className="space-y-2">
                {insight.key_quotes.map((q, i) => (
                  <p key={i} className="text-sm italic leading-relaxed" style={{ color: "var(--txt-2)" }}>&ldquo;{q}&rdquo;</p>
                ))}
              </div>
            </div>
          )}

          {insight.action_items.length > 0 && (
            <div className="px-5 pb-3">
              <p className="text-xs font-bold uppercase tracking-widest mb-2.5 flex items-center gap-1.5" style={{ color: "var(--txt-4)" }}>
                <Zap className="w-3 h-3" /> Action Items
              </p>
              <ul className="space-y-2">
                {insight.action_items.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: "var(--txt-2)" }}>
                    <span className="flex-shrink-0 font-semibold" style={{ color: "var(--acc)" }}>→</span>
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
        className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t text-xs font-medium transition-colors mt-auto"
        style={{ borderColor: "var(--bdr)", color: "var(--txt-4)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--acc)";
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

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: () => React.ReactElement }> = {
  spotify: { label: "Spotify",        color: "#1DB954", icon: SpotifyIcon },
  apple:   { label: "Apple Podcasts", color: "#B150E2", icon: AppleIcon },
  youtube: { label: "YouTube",        color: "#FF0000", icon: YouTubeIcon },
  website: { label: "Website",        color: "var(--txt-3)", icon: () => <Globe className="w-3.5 h-3.5" /> },
};

function PlatformLinkRow({ links }: { links: PlatformLinks }) {
  const entries = (["spotify", "apple", "youtube", "website"] as const)
    .filter((k) => links[k]);
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <span className="text-xs font-medium" style={{ color: "var(--txt-4)" }}>Listen on</span>
      {entries.map((key) => {
        const { label, color, icon: Icon } = PLATFORM_CONFIG[key];
        return (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity hover:opacity-75"
            style={{ background: "var(--bg-chip)", border: "1px solid var(--bdr)", color }}
          >
            <Icon />
            <span className="hidden sm:inline">{label}</span>
          </a>
        );
      })}
    </div>
  );
}

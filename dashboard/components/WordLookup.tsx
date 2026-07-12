"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, BookOpen } from "lucide-react";

export interface DictEntry {
  pos: string;
  definition: string;
  examples: string[];
  synonyms: string[];
}

interface PopoverState {
  word: string;
  x: number;
  y: number;
  loading: boolean;
  entries: DictEntry[] | null;
}

// Shared across every LookupableText instance on the page — a word looked
// up once (from any insight card) is instant everywhere else for the rest
// of the session.
const lookupCache = new Map<string, DictEntry[]>();

function cleanWord(raw: string): string {
  return raw.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, "");
}

/** One lookup-popover per card — call `lookup(word, x, y)` from a click/double-click handler. */
export function useWordLookup() {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const lookup = useCallback(async (rawWord: string, x: number, y: number) => {
    const word = cleanWord(rawWord);
    if (!word || word.length < 2 || word.includes(" ")) return;

    if (lookupCache.has(word)) {
      setPopover({ word, x, y, loading: false, entries: lookupCache.get(word)! });
      return;
    }

    setPopover({ word, x, y, loading: true, entries: null });
    try {
      const res = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
      const data = await res.json();
      const entries: DictEntry[] = data.entries ?? [];
      lookupCache.set(word, entries);
      setPopover({ word, x, y, loading: false, entries });
    } catch {
      setPopover({ word, x, y, loading: false, entries: [] });
    }
  }, []);

  const close = useCallback(() => setPopover(null), []);

  return { popover, lookup, close };
}

export function DictionaryPopover({ popover, onClose }: { popover: PopoverState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popover) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popover, onClose]);

  if (!popover || typeof document === "undefined") return null;

  // Clamp so the popover never renders off-screen at the viewport edges.
  const width = 280;
  const left = Math.min(Math.max(8, popover.x - width / 2), window.innerWidth - width - 8);
  const top = Math.min(popover.y + 16, window.innerHeight - 8);

  return createPortal(
    <div
      ref={ref}
      className="fixed rounded-xl border shadow-2xl overflow-hidden z-[200]"
      style={{ left, top, width, maxHeight: 320, background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--bdr)" }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--acc)" }} />
          <span className="text-sm font-semibold truncate" style={{ color: "var(--txt-1)" }}>{popover.word}</span>
        </div>
        <button onClick={onClose} style={{ color: "var(--txt-4)" }} className="flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 py-2.5 overflow-y-auto" style={{ maxHeight: 270 }}>
        {popover.loading && (
          <div className="flex items-center gap-2 py-3 text-xs" style={{ color: "var(--txt-4)" }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up…
          </div>
        )}
        {!popover.loading && popover.entries && popover.entries.length === 0 && (
          <p className="text-xs py-2" style={{ color: "var(--txt-4)" }}>No definition found for &ldquo;{popover.word}&rdquo;.</p>
        )}
        {!popover.loading && popover.entries && popover.entries.length > 0 && (
          <div className="space-y-2.5">
            {popover.entries.map((e, i) => (
              <div key={i}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--bg-elevated)", color: "var(--txt-4)" }}
                  >
                    {e.pos}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--txt-2)" }}>{e.definition}</p>
                {e.examples.length > 0 && (
                  <p className="text-xs italic mt-0.5" style={{ color: "var(--txt-4)" }}>&ldquo;{e.examples[0]}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Renders `text`, always double-click-to-lookup-capable. When `dictionaryMode`
 * is on, additionally splits it into individually clickable, dotted-underline
 * word spans (more discoverable than double-click for users who don't know
 * the feature exists).
 */
export function LookupableText({
  text, dictionaryMode, onLookup, className, style,
}: {
  text: string;
  dictionaryMode: boolean;
  onLookup: (word: string, x: number, y: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  function handleDoubleClick(e: React.MouseEvent) {
    const selected = window.getSelection()?.toString().trim() ?? "";
    if (!selected || selected.includes(" ")) return;
    onLookup(selected, e.clientX, e.clientY);
  }

  if (!dictionaryMode) {
    return (
      <span className={className} style={style} onDoubleClick={handleDoubleClick}>
        {text}
      </span>
    );
  }

  const tokens = text.split(/(\s+)/);
  return (
    <span className={className} style={style} onDoubleClick={handleDoubleClick}>
      {tokens.map((tok, i) => {
        if (!/[a-zA-Z]/.test(tok)) return <span key={i}>{tok}</span>;
        return (
          <span
            key={i}
            onClick={(e) => { e.stopPropagation(); onLookup(tok, e.clientX, e.clientY); }}
            style={{ textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: "var(--txt-4)", textUnderlineOffset: "3px", cursor: "pointer" }}
          >
            {tok}
          </span>
        );
      })}
    </span>
  );
}

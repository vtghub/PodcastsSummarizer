"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Insight, PlatformLinks } from "@/lib/db";
import {
  ChevronDown, ChevronUp, Quote, Zap, Tag, Volume2, VolumeX, Globe,
  CalendarDays, ThumbsUp, ThumbsDown, Share2, Eye, MessageCircle,
  Link2, Check, Send, Trash2, X,
} from "lucide-react";
import { useTTS } from "@/contexts/TTSContext";
import { useSpeech } from "@/hooks/useSpeech";

interface Props {
  insight: Insight;
  domainColor: { bg: string; text: string; border: string; dot: string };
  isAuthed: boolean;
}

interface Comment {
  id: number;
  body: string;
  created_at: string;
  user_id: string;
  display_name: string;
  likes: number;
  dislikes: number;
  my_reaction: "like" | "dislike" | null;
  is_mine: boolean;
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

function formatCommentDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
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

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function InsightCard({ insight, domainColor, isAuthed }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { enabled: ttsEnabled } = useTTS();
  const speechText = useMemo(() => buildSpeechText(insight), [insight]);
  const { speaking, speak } = useSpeech(speechText);
  const dk = domainColorKey(insight.domain ?? "");

  // ── Engagement state ───────────────────────────────────────────────────────
  const [views, setViews] = useState(0);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [myReaction, setMyReaction] = useState<"like" | "dislike" | null>(null);
  const [reacting, setReacting] = useState(false);

  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Load engagement data on mount ─────────────────────────────────────────
  useEffect(() => {
    // Record view + get count
    fetch(`/api/insights/${insight.id}/view`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => setViews(d.views ?? 0))
      .catch(() => {});

    // Get reaction counts + my reaction
    fetch(`/api/insights/${insight.id}/react`)
      .then((r) => r.json())
      .then((d) => {
        setLikes(d.likes ?? 0);
        setDislikes(d.dislikes ?? 0);
        setMyReaction(d.mine ?? null);
      })
      .catch(() => {});
  }, [insight.id]);

  // ── Close share dropdown on outside click ─────────────────────────────────
  useEffect(() => {
    if (!showShare) return;
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShare(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showShare]);

  // ── Load comments when panel opens ────────────────────────────────────────
  useEffect(() => {
    if (!showComments) return;
    setCommentsLoading(true);
    fetch(`/api/insights/${insight.id}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {})
      .finally(() => setCommentsLoading(false));
  }, [showComments, insight.id]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleReact = useCallback(async (type: "like" | "dislike") => {
    if (!isAuthed || reacting) return;
    setReacting(true);
    // Optimistic update
    const prev = myReaction;
    if (myReaction === type) {
      setMyReaction(null);
      setLikes((l) => type === "like" ? l - 1 : l);
      setDislikes((d) => type === "dislike" ? d - 1 : d);
    } else {
      if (myReaction) {
        setLikes((l) => myReaction === "like" ? l - 1 : l);
        setDislikes((d) => myReaction === "dislike" ? d - 1 : d);
      }
      setMyReaction(type);
      setLikes((l) => type === "like" ? l + 1 : l);
      setDislikes((d) => type === "dislike" ? d + 1 : d);
    }
    try {
      const res = await fetch(`/api/insights/${insight.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setLikes(data.likes);
        setDislikes(data.dislikes);
        setMyReaction(data.mine);
      } else {
        // Revert on error
        setMyReaction(prev);
      }
    } catch {
      setMyReaction(prev);
    } finally {
      setReacting(false);
    }
  }, [insight.id, isAuthed, myReaction, reacting]);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/dashboard?date=${insight.date}`
    : "";
  const shareText = `${insight.episode_title ?? insight.source_name ?? "Podcast Insight"} — ${insight.summary?.slice(0, 100)}…`;

  const handleShare = useCallback((platform: "twitter" | "linkedin" | "copy") => {
    if (platform === "copy") {
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else if (platform === "twitter") {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, "_blank");
    } else if (platform === "linkedin") {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, "_blank");
    }
    setShowShare(false);
  }, [shareUrl, shareText]);

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/insights/${insight.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data.comment]);
        setCommentBody("");
      }
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  }, [insight.id, commentBody, submitting]);

  const handleCommentReact = useCallback(async (commentId: number, type: "like" | "dislike") => {
    if (!isAuthed) return;
    const res = await fetch(`/api/comments/${commentId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (res.ok) {
      setComments((prev) => prev.map((c) =>
        c.id === commentId
          ? { ...c, likes: data.likes, dislikes: data.dislikes, my_reaction: data.mine }
          : c
      ));
    }
  }, [isAuthed]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

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

      {/* Key points */}
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

      {/* Expand / collapse */}
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

      {/* ── Engagement bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-4 py-2.5 border-t"
        style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}
      >
        {/* Views */}
        <span className="flex items-center gap-1 text-xs mr-2" style={{ color: "var(--txt-4)" }}>
          <Eye className="w-3.5 h-3.5" />
          {fmtCount(views)}
        </span>

        {/* Like */}
        <EngagementButton
          onClick={() => handleReact("like")}
          active={myReaction === "like"}
          disabled={!isAuthed}
          title={isAuthed ? "Like" : "Sign in to react"}
          activeColor="var(--acc)"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          {likes > 0 && <span>{fmtCount(likes)}</span>}
        </EngagementButton>

        {/* Dislike */}
        <EngagementButton
          onClick={() => handleReact("dislike")}
          active={myReaction === "dislike"}
          disabled={!isAuthed}
          title={isAuthed ? "Dislike" : "Sign in to react"}
          activeColor="#EF4444"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          {dislikes > 0 && <span>{fmtCount(dislikes)}</span>}
        </EngagementButton>

        {/* Comments toggle */}
        <EngagementButton
          onClick={() => setShowComments((v) => !v)}
          active={showComments}
          title="Comments"
          activeColor="var(--acc)"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {comments.length > 0 && <span>{fmtCount(comments.length)}</span>}
        </EngagementButton>

        {/* Share */}
        <div className="relative ml-auto" ref={shareRef}>
          <EngagementButton
            onClick={() => setShowShare((v) => !v)}
            active={showShare}
            title="Share"
            activeColor="var(--acc)"
          >
            <Share2 className="w-3.5 h-3.5" />
          </EngagementButton>
          {showShare && (
            <div
              className="absolute bottom-full right-0 mb-2 rounded-xl border shadow-2xl overflow-hidden z-20"
              style={{ background: "var(--bg-nav)", borderColor: "var(--bdr)", minWidth: 160 }}
            >
              <ShareOption icon={<XIcon />} label="Twitter / X" color="#000" onClick={() => handleShare("twitter")} />
              <ShareOption icon={<LinkedInIcon />} label="LinkedIn" color="#0A66C2" onClick={() => handleShare("linkedin")} />
              <ShareOption
                icon={copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                label={copied ? "Copied!" : "Copy link"}
                color={copied ? "#10B981" : "var(--txt-2)"}
                onClick={() => handleShare("copy")}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Comments panel ─────────────────────────────────────────────────── */}
      {showComments && (
        <div className="border-t" style={{ borderColor: "var(--bdr)" }}>
          {commentsLoading ? (
            <div className="px-5 py-4 text-xs text-center" style={{ color: "var(--txt-4)" }}>Loading comments…</div>
          ) : (
            <>
              {comments.length === 0 && (
                <p className="px-5 py-4 text-xs text-center" style={{ color: "var(--txt-4)" }}>
                  No comments yet. Be the first!
                </p>
              )}
              {comments.length > 0 && (
                <div className="divide-y" style={{ borderColor: "var(--bdr)" }}>
                  {comments.map((c) => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      isAuthed={isAuthed}
                      onReact={handleCommentReact}
                      onDelete={handleDeleteComment}
                    />
                  ))}
                </div>
              )}
              {isAuthed ? (
                <form onSubmit={handleCommentSubmit} className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--bdr)" }}>
                  <input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment…"
                    maxLength={2000}
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--bdr)",
                      color: "var(--txt-1)",
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--acc)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--bdr)")}
                  />
                  <button
                    type="submit"
                    disabled={!commentBody.trim() || submitting}
                    className="flex-shrink-0 p-2 rounded-lg transition-colors disabled:opacity-40"
                    style={{ background: "var(--acc)", color: "#fff" }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <p className="px-5 py-3 text-xs text-center border-t" style={{ borderColor: "var(--bdr)", color: "var(--txt-4)" }}>
                  <a href="/login" style={{ color: "var(--acc)" }}>Sign in</a> to comment
                </p>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EngagementButton({
  onClick, active, disabled, title, activeColor, children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  activeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed"
      style={{
        color: active ? activeColor : "var(--txt-4)",
        background: active ? `${activeColor}18` : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hov)";
          (e.currentTarget as HTMLElement).style.color = "var(--txt-2)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--txt-4)";
        }
      }}
    >
      {children}
    </button>
  );
}

function ShareOption({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors"
      style={{ color }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hov)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {icon}
      {label}
    </button>
  );
}

function CommentRow({ comment, isAuthed, onReact, onDelete }: {
  comment: Comment;
  isAuthed: boolean;
  onReact: (id: number, type: "like" | "dislike") => void;
  onDelete: (id: number) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="px-5 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: "var(--txt-2)" }}>{comment.display_name}</span>
        <span className="text-xs" style={{ color: "var(--txt-4)" }}>{formatCommentDate(comment.created_at)}</span>
        {comment.is_mine && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete comment"
            style={{ color: "var(--txt-4)" }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        {comment.is_mine && confirmDelete && (
          <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: "var(--txt-4)" }}>
            Delete?
            <button onClick={() => onDelete(comment.id)} className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: "#EF444420", color: "#EF4444" }}>Yes</button>
            <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded" style={{ color: "var(--txt-4)" }}><X className="w-3 h-3" /></button>
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--txt-2)" }}>{comment.body}</p>
      <div className="flex items-center gap-0.5">
        <EngagementButton
          onClick={() => isAuthed && onReact(comment.id, "like")}
          active={comment.my_reaction === "like"}
          disabled={!isAuthed}
          title={isAuthed ? "Like" : "Sign in to react"}
          activeColor="var(--acc)"
        >
          <ThumbsUp className="w-3 h-3" />
          {comment.likes > 0 && <span>{comment.likes}</span>}
        </EngagementButton>
        <EngagementButton
          onClick={() => isAuthed && onReact(comment.id, "dislike")}
          active={comment.my_reaction === "dislike"}
          disabled={!isAuthed}
          title={isAuthed ? "Dislike" : "Sign in to react"}
          activeColor="#EF4444"
        >
          <ThumbsDown className="w-3 h-3" />
          {comment.dislikes > 0 && <span>{comment.dislikes}</span>}
        </EngagementButton>
      </div>
    </div>
  );
}

// ── Social share icons ────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

// ── Platform links (unchanged) ────────────────────────────────────────────────

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
  const entries = (["spotify", "apple", "youtube", "website"] as const).filter((k) => links[k]);
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

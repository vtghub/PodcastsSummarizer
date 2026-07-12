"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Send, Loader2, MessageCircle, ChevronRight, Sparkles, X, Search } from "lucide-react";
import Link from "next/link";
import { getDomainColor } from "@/lib/domain-colors";
import type { Source, EpisodeItem } from "@/lib/db";

interface Citation {
  index: number;
  id: string;
  date: string;
  domain: string;
  source_name: string;
  episode_title: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: boolean;
}

const FALLBACK_QUESTIONS = [
  "What are the key takeaways about AI from recent episodes?",
  "What investment strategies were discussed this week?",
  "What productivity habits do guests recommend?",
  "What health and longevity advice has been shared?",
];

type Mode = "general" | "episode";

interface SelectedEpisode {
  id: string;
  title: string;
  sourceName: string;
  hasTranscript: boolean;
}

export default function AskChat({ subscribedSources }: { subscribedSources: Source[] }) {
  const [mode, setMode] = useState<Mode>("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState(FALLBACK_QUESTIONS);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Episode mode — picker state
  const [podcastQuery, setPodcastQuery] = useState("");
  const [pickerSourceId, setPickerSourceId] = useState("");
  const [pickerEpisodes, setPickerEpisodes] = useState<EpisodeItem[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<SelectedEpisode | null>(null);
  const [episodeLoadError, setEpisodeLoadError] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Personalized from the user's actual subscriptions/recent insights —
  // falls back to the generic static list on error or if there's nothing
  // to personalize from yet (no subscriptions, no recent insights).
  useEffect(() => {
    fetch("/api/ask/suggestions")
      .then((r) => r.json())
      .then((d) => { if (d.questions?.length) setSuggestedQuestions(d.questions); })
      .catch(() => {});
  }, []);

  // Deep link from an Insight Card or the Episode Digest picker: ?episode=<id>
  // Read directly from window.location rather than useSearchParams() — this
  // is a one-time read-on-mount, not something that needs to react to
  // client-side navigation, so it doesn't need the Suspense boundary
  // useSearchParams() would otherwise require.
  useEffect(() => {
    const episodeId = new URLSearchParams(window.location.search).get("episode");
    if (!episodeId) return;
    setMode("episode");
    setEpisodeLoadError("");
    fetch(`/api/ask/episode?id=${encodeURIComponent(episodeId)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed to load episode");
        setSelectedEpisode({ id: episodeId, title: d.title, sourceName: d.sourceName, hasTranscript: d.hasTranscript });
      })
      .catch((e) => setEpisodeLoadError(e instanceof Error ? e.message : "Failed to load episode"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPickerEpisodes = useCallback(async (sourceId: string) => {
    if (!sourceId) { setPickerEpisodes([]); return; }
    setLoadingEpisodes(true);
    setPickerEpisodes([]);
    try {
      const res = await fetch(`/api/digest/episodes?sourceId=${encodeURIComponent(sourceId)}&includeAll=true`);
      const data: EpisodeItem[] = await res.json();
      setPickerEpisodes(Array.isArray(data) ? data : []);
    } catch {
      setPickerEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  }, []);

  useEffect(() => { loadPickerEpisodes(pickerSourceId); }, [pickerSourceId, loadPickerEpisodes]);

  function chooseEpisode(ep: EpisodeItem, sourceName: string) {
    setSelectedEpisode({ id: ep.id, title: ep.title, sourceName, hasTranscript: true });
    setMessages([]);
    setPickerSourceId("");
    setPodcastQuery("");
  }

  function changeEpisode() {
    setSelectedEpisode(null);
    setMessages([]);
    setEpisodeLoadError("");
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setMessages([]);
    if (next === "general") {
      setSelectedEpisode(null);
      setEpisodeLoadError("");
    }
  }

  async function handleSubmit(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    if (mode === "episode" && !selectedEpisode) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(mode === "episode" ? "/api/ask/episode" : "/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "episode" ? { episodeId: selectedEpisode!.id, question: q } : { question: q }
        ),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error ?? "Something went wrong.", error: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer, citations: data.citations ?? [] },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again.", error: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    handleSubmit(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  }

  const isEmpty = messages.length === 0;
  const filteredSources = podcastQuery
    ? subscribedSources.filter((s) => s.name.toLowerCase().includes(podcastQuery.toLowerCase()))
    : subscribedSources;
  const canChat = mode === "general" || Boolean(selectedEpisode);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col max-w-3xl mx-auto px-4 sm:px-6 pb-6">
      {/* Header */}
      <div className="pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--acc-bg)" }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: "var(--acc)" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "var(--txt-1)" }}>
            Ask your podcasts
          </h1>
        </div>
        <p className="text-sm ml-12" style={{ color: "var(--txt-4)" }}>
          Ask any question — I&apos;ll search your subscribed episode insights and answer using AI.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-1.5 mt-4 ml-12">
          <button
            onClick={() => switchMode("general")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            style={{
              background: mode === "general" ? "var(--acc)" : "var(--bg-elevated)",
              color: mode === "general" ? "#fff" : "var(--txt-3)",
              borderColor: mode === "general" ? "var(--acc)" : "var(--bdr)",
            }}
          >
            My Podcasts
          </button>
          <button
            onClick={() => switchMode("episode")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border"
            style={{
              background: mode === "episode" ? "var(--acc)" : "var(--bg-elevated)",
              color: mode === "episode" ? "#fff" : "var(--txt-3)",
              borderColor: mode === "episode" ? "var(--acc)" : "var(--bdr)",
            }}
          >
            <Sparkles className="w-3 h-3" />
            Ask About an Episode
          </button>
        </div>
      </div>

      {/* Episode picker (mode=episode, nothing selected yet) */}
      {mode === "episode" && !selectedEpisode && (
        <div className="flex flex-col gap-3 mb-4">
          {episodeLoadError && <p className="text-sm" style={{ color: "#EF4444" }}>{episodeLoadError}</p>}
          <p className="text-xs" style={{ color: "var(--txt-4)" }}>
            Works for any episode with a saved transcript — even ones that haven&apos;t been fully processed into insights yet.
          </p>

          {subscribedSources.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--txt-4)" }}>
              Subscribe to a podcast first to ask about its episodes.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--txt-4)" }} />
                <input
                  value={podcastQuery}
                  onChange={(e) => setPodcastQuery(e.target.value)}
                  placeholder="Search your podcasts…"
                  className="input"
                  style={{ paddingLeft: "2.25rem" }}
                  autoComplete="off"
                />
              </div>
              <div className="rounded-xl border overflow-hidden max-h-48 overflow-y-auto" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
                {filteredSources.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs" style={{ color: "var(--txt-4)" }}>No podcasts match.</p>
                ) : (
                  filteredSources.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPickerSourceId(s.id === pickerSourceId ? "" : s.id)}
                      className="w-full text-left px-3 py-2.5 text-sm transition-colors border-b last:border-b-0"
                      style={{
                        color: "var(--txt-1)",
                        borderColor: "var(--bdr)",
                        background: s.id === pickerSourceId ? "var(--bg-elevated)" : "transparent",
                      }}
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>

              {pickerSourceId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Episode</label>
                  {loadingEpisodes ? (
                    <div className="flex items-center gap-2 py-2 text-xs" style={{ color: "var(--txt-4)" }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading episodes…
                    </div>
                  ) : pickerEpisodes.length === 0 ? (
                    <p className="text-xs py-2" style={{ color: "var(--txt-4)" }}>No episodes found.</p>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => {
                        const ep = pickerEpisodes.find((x) => x.id === e.target.value);
                        const source = subscribedSources.find((s) => s.id === pickerSourceId);
                        if (ep) chooseEpisode(ep, source?.name ?? "");
                      }}
                      className="input"
                    >
                      <option value="">— choose an episode —</option>
                      {pickerEpisodes.map((ep) => (
                        <option key={ep.id} value={ep.id}>
                          {ep.processed ? "✓ " : "○ "}{ep.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[10px]" style={{ color: "var(--txt-4)" }}>✓ = insights already generated · ○ = not yet processed (works if transcribed)</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Selected episode header */}
      {mode === "episode" && selectedEpisode && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border mb-4 text-sm"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--acc)" }} />
          <div className="min-w-0 flex-1">
            <span className="font-medium truncate" style={{ color: "var(--txt-1)" }}>{selectedEpisode.title}</span>
            {selectedEpisode.sourceName && (
              <span className="ml-1.5" style={{ color: "var(--txt-4)" }}>— {selectedEpisode.sourceName}</span>
            )}
          </div>
          <button onClick={changeEpisode} title="Change episode" style={{ color: "var(--txt-4)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Chat area */}
      {canChat && (
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {isEmpty ? (
            mode === "general" ? (
              <div className="flex flex-col gap-3 mt-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>
                  Try asking
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSubmit(q)}
                      disabled={loading}
                      className="text-left p-3 rounded-xl border text-sm transition-all group"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--bdr)",
                        color: "var(--txt-3)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--acc)";
                        (e.currentTarget as HTMLElement).style.color = "var(--txt-1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--bdr)";
                        (e.currentTarget as HTMLElement).style.color = "var(--txt-3)";
                      }}
                    >
                      <span className="line-clamp-2">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm mt-4" style={{ color: "var(--txt-4)" }}>
                Ask anything about this episode — a summary, a specific moment, what a guest said about a topic, and so on.
              </p>
            )
          ) : (
            <div className="flex flex-col gap-4 pt-2">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "user" ? (
                    <div
                      className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm"
                      style={{ background: "var(--acc)", color: "#fff" }}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[90%] flex flex-col gap-2">
                      <div
                        className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                        style={{
                          background: msg.error ? "rgba(127,29,29,0.2)" : "var(--bg-surface)",
                          borderColor: msg.error ? "rgba(185,28,28,0.3)" : "var(--bdr)",
                          border: "1px solid",
                          color: msg.error ? "#F87171" : "var(--txt-1)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.content}
                      </div>
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="flex flex-col gap-1.5 pl-1">
                          <p className="text-xs" style={{ color: "var(--txt-4)" }}>Sources used:</p>
                          {msg.citations.map((c) => {
                            const colors = getDomainColor(c.domain);
                            return (
                              <Link
                                key={c.id}
                                href={`/dashboard?date=${c.date}&domain=${encodeURIComponent(c.domain)}&insight=${c.id}`}
                                className="flex items-center gap-2 text-xs p-2 rounded-lg border transition-colors group"
                                style={{
                                  background: "var(--bg-elevated)",
                                  borderColor: "var(--bdr)",
                                  color: "var(--txt-3)",
                                }}
                              >
                                <span className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--acc-bg)", color: "var(--acc)" }}>
                                  {c.index}
                                </span>
                                <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                                  {c.domain.split(" & ")[0]}
                                </span>
                                <span className="truncate font-medium">{c.source_name}</span>
                                {c.episode_title && (
                                  <span className="truncate hidden sm:inline" style={{ color: "var(--txt-4)" }}>
                                    — {c.episode_title}
                                  </span>
                                )}
                                <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0 opacity-40 group-hover:opacity-100" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div
                    className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2 text-sm"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--bdr)", color: "var(--txt-4)" }}
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {mode === "episode" ? "Reading transcript…" : "Searching insights…"}
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {canChat && (
        <div
          className="mt-4 rounded-2xl border overflow-hidden"
          style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
        >
          <form onSubmit={onFormSubmit} className="flex items-end gap-2 p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={mode === "episode" ? "Ask about this episode…" : "Ask anything about your podcasts…"}
              rows={1}
              className="flex-1 bg-transparent outline-none text-sm resize-none leading-relaxed"
              style={{
                color: "var(--txt-1)",
                maxHeight: "8rem",
                overflowY: "auto",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
              style={{ background: "var(--acc)", color: "#fff" }}
              title="Send (Enter)"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <p className="px-3 pb-2 text-[10px]" style={{ color: "var(--txt-4)" }}>
            {mode === "episode"
              ? "Press Enter to send · Shift+Enter for new line · Answers are based on this episode's transcript"
              : "Press Enter to send · Shift+Enter for new line · Answers are based on your subscribed podcast insights"}
          </p>
        </div>
      )}
    </div>
  );
}

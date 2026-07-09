"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Send, Loader2, MessageCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getDomainColor } from "@/lib/domain-colors";

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

const SUGGESTED_QUESTIONS = [
  "What are the key takeaways about AI from recent episodes?",
  "What investment strategies were discussed this week?",
  "What productivity habits do guests recommend?",
  "What health and longevity advice has been shared?",
];

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
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
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {isEmpty ? (
          <div className="flex flex-col gap-3 mt-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>
              Try asking
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
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
                  Searching insights…
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
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
            placeholder="Ask anything about your podcasts…"
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
          Press Enter to send · Shift+Enter for new line · Answers are based on your subscribed podcast insights
        </p>
      </div>
    </div>
  );
}

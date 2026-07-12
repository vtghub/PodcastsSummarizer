import Link from "next/link";
import { Mic2, Search, Bookmark, CalendarDays, Bell, Mail, Volume2, Download, MessageCircle, Sparkles } from "lucide-react";

const features = [
  {
    icon: Mic2,
    title: "Daily Digest Email",
    body: "Personalized key takeaways from only the podcasts you follow — no fluff, delivered every morning.",
  },
  {
    icon: MessageCircle,
    title: "Ask Your Podcasts (AI)",
    body: "Ask any question in plain language and the AI searches your subscribed episodes to answer it — with citations linking back to the exact insight.",
  },
  {
    icon: Search,
    title: "Instant Search",
    body: "Search by keyword, guest name, podcast channel, or episode title and jump straight to the card.",
  },
  {
    icon: Bookmark,
    title: "Bookmark & Revisit",
    body: "Star any insight to save it. Your bookmarks live on a dedicated page, ready whenever you need them.",
  },
  {
    icon: CalendarDays,
    title: "Browse by Date & Topic",
    body: "Insights organized by date and domain — Technology, Business, Health, Finance, and more.",
  },
  {
    icon: Bell,
    title: "Never Miss an Episode",
    body: "Fresh episodes picked up every 4 hours. New cards appear on your dashboard in real time.",
  },
  {
    icon: Mail,
    title: "On-Demand Digest",
    body: 'Hit "Send Digest Now" from your profile and your digest lands in your inbox instantly.',
  },
  {
    icon: Download,
    title: "Export Your Insights",
    body: "Download a day's insights as a PDF, Excel spreadsheet, or Word document — useful for sharing, archiving, or building a personal knowledge base.",
  },
  {
    icon: Volume2,
    title: "Listen to Insights",
    body: "Enable Read Aloud and the dashboard reads the cards to you — hands-free.",
  },
];

// Deduplicated pool across all three waterfalls (Insight Extraction, Recommendations, Ask AI) —
// see README's Provider Registry section for exactly which subset each feature draws from.
const aiModels = [
  "Gemini 2.0 Flash",
  "Groq — Llama 3.1 8B",
  "Groq — Llama 3.3 70B",
  "Mistral Small",
  "Cohere Command R",
  "Together — Llama 3.1 8B",
  "NVIDIA Nemotron 3 Ultra (OpenRouter)",
  "NVIDIA Nemotron 3 Nano (OpenRouter)",
  "Poolside Laguna M.1 (OpenRouter)",
  "Tencent Hy3 (OpenRouter)",
];

export default function AboutPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      {/* Hero */}
      <div className="mb-8 sm:mb-12 text-center">
        <div className="text-4xl sm:text-5xl mb-3">🎙</div>
        <h1 className="text-2xl sm:text-4xl font-bold mb-3" style={{ color: "var(--txt-1)" }}>
          Podcast Insights
        </h1>
        <p className="text-sm sm:text-base leading-relaxed max-w-md mx-auto" style={{ color: "var(--txt-3)" }}>
          Listens to your podcasts, extracts what matters, and delivers it to you — daily, searchable, always up to date.
        </p>
      </div>

      {/* Features */}
      <div className="space-y-2.5 sm:space-y-4 mb-8 sm:mb-12">
        {features.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex items-start gap-3 px-3.5 py-3 sm:p-5 rounded-xl border card-lift"
            style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
          >
            <div
              className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "var(--acc-bg, rgba(194,65,12,0.08))" }}
            >
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--acc)" }} />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm sm:text-base leading-snug mb-0.5" style={{ color: "var(--txt-1)" }}>
                {title}
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "var(--txt-3)" }}>
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Powered by Free AI Models */}
      <div
        className="flex items-start gap-3 px-3.5 py-3 sm:p-5 rounded-xl border mb-8 sm:mb-12"
        style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mt-0.5"
          style={{ background: "var(--acc-bg, rgba(194,65,12,0.08))" }}
        >
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--acc)" }} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-sm sm:text-base leading-snug mb-0.5" style={{ color: "var(--txt-1)" }}>
            Powered by Free AI Models
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed mb-2.5" style={{ color: "var(--txt-3)" }}>
            Insight extraction, weekly recommendations, and Ask AI each run on a free-tier model waterfall — if
            one is out of quota, the next takes over automatically. No paid subscriptions behind the scenes.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {aiModels.map((m) => (
              <span
                key={m}
                className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full border"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div
        className="text-center rounded-2xl border px-5 py-7 sm:px-6 sm:py-10"
        style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
      >
        <p className="text-sm sm:text-base mb-5" style={{ color: "var(--txt-2)" }}>
          Pick the podcasts you care about, subscribe, and let the system do the rest.
        </p>
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
            style={{ background: "var(--bg-elevated)", color: "var(--txt-2)", border: "1px solid var(--bdr)" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

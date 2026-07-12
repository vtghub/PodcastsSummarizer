import Link from "next/link";
import {
  Mic2, Search, Bookmark, CalendarDays, Bell, Mail, Volume2, Download,
  MessageCircle, Sparkles, BookOpen, BarChart3, Compass,
} from "lucide-react";

// Cycled per-card for visual variety — same palette InsightCard uses for domain badges.
const DOMAIN_KEYS = ["tech", "biz", "hlth", "fin", "lead", "soc", "gen", "oth"];

const features = [
  {
    icon: Mic2,
    title: "Daily Digest Email",
    body: "Personalized key takeaways from only the podcasts you follow — no fluff, delivered every morning.",
  },
  {
    icon: MessageCircle,
    title: "Ask Your Podcasts (AI)",
    body: "Ask any question in plain language and the AI searches your subscribed episodes to answer it — with citations linking back to the exact insight. Personalized suggested questions get you started, and you can also ask about one specific episode's transcript directly.",
  },
  {
    icon: BookOpen,
    title: "Dictionary Lookup",
    body: "Double-click any word on an insight card — or tap the book icon to make every word clickable — for an instant definition popover. Backed by the Princeton WordNet database, no AI call needed.",
  },
  {
    icon: Search,
    title: "Instant Search",
    body: "Search by keyword, guest name, podcast channel, or episode title and jump straight to the card.",
  },
  {
    icon: Compass,
    title: "For You",
    body: "On-demand best-of-week picks and trending podcast suggestions, ranked by AI — refresh anytime, or get it Sunday mornings in your inbox.",
  },
  {
    icon: BarChart3,
    title: "Your Analytics",
    body: "See your reading habits at a glance — insights viewed, domains explored, and your most-read cards over the last 30 days.",
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
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-20">
      {/* Hero */}
      <div className="relative mb-10 sm:mb-16 text-center">
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/4 w-64 h-64 sm:w-80 sm:h-80 rounded-full pointer-events-none"
          style={{ background: "var(--acc-bg, rgba(194,65,12,0.08))", filter: "blur(48px)" }}
        />
        <div className="relative">
          <div className="text-5xl sm:text-6xl mb-4">🎙</div>
          <h1 className="text-3xl sm:text-5xl font-bold mb-3 tracking-tight" style={{ color: "var(--txt-1)" }}>
            Podcast Insights
          </h1>
          <p className="text-sm sm:text-lg leading-relaxed max-w-lg mx-auto" style={{ color: "var(--txt-3)" }}>
            Listens to your podcasts, extracts what matters, and delivers it to you — daily, searchable, always up to date.
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 mb-8 sm:mb-14">
        {features.map(({ icon: Icon, title, body }, i) => {
          const dk = DOMAIN_KEYS[i % DOMAIN_KEYS.length];
          return (
            <div
              key={title}
              className="flex items-start gap-3 px-3.5 py-3 sm:p-5 rounded-xl border card-lift"
              style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
            >
              <div
                className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mt-0.5"
                style={{ background: `var(--d-${dk}-bg)` }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: `var(--d-${dk}-txt)` }} />
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
          );
        })}
      </div>

      {/* Powered by Free AI Models */}
      <div
        className="flex items-start gap-3 px-3.5 py-3 sm:p-6 rounded-xl border mb-8 sm:mb-14"
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
            Insight extraction, weekly recommendations, and Ask AI — including answering questions about one
            specific episode's transcript — each run on a free-tier model waterfall: if one provider is out of
            quota, the next takes over automatically, with no interruption and no paid subscriptions behind the
            scenes. Dictionary Lookup is the one exception — word definitions are retrieved directly from a stored
            WordNet database, so no AI model or quota is involved at all.
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
        className="text-center rounded-2xl border px-5 py-8 sm:px-6 sm:py-12"
        style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
      >
        <p className="text-sm sm:text-lg mb-5" style={{ color: "var(--txt-2)" }}>
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

import Link from "next/link";
import {
  Mic2, Search, Bookmark, CalendarDays, Bell, Mail, Volume2, Download,
  MessageCircle, Sparkles, BookOpen, BarChart3, Compass,
} from "lucide-react";

function LinkedInIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.755-1.333-1.755-1.089-.744.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.303-5.467-1.332-5.467-5.93 0-1.31.468-2.38 1.235-3.22-.123-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23A11.5 11.5 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.807 5.624-5.48 5.92.43.372.814 1.103.814 2.222 0 1.606-.014 2.898-.014 3.293 0 .32.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

// Cycled per-card for visual variety — same palette InsightCard uses for domain badges.
const DOMAIN_KEYS = ["tech", "biz", "hlth", "fin", "lead", "soc", "gen", "oth"];

const features = [
  {
    icon: Mic2,
    title: "Daily Digest Email",
    body: "Key takeaways from only the podcasts you follow, delivered every morning.",
  },
  {
    icon: MessageCircle,
    title: "Ask Your Podcasts (AI)",
    body: "Ask anything in plain language — the AI answers with citations back to the exact insight.",
  },
  {
    icon: BookOpen,
    title: "Dictionary Lookup",
    body: "Double-click any word for an instant definition — WordNet-powered, no AI call needed.",
  },
  {
    icon: Search,
    title: "Instant Search",
    body: "Search by keyword, guest, podcast, or episode title and jump straight to the card.",
  },
  {
    icon: Compass,
    title: "For You",
    body: "AI-ranked best-of-week picks and trending podcasts, refreshed on demand or every Sunday.",
  },
  {
    icon: BarChart3,
    title: "Your Analytics",
    body: "Views, domains explored, and your most-read cards over the last 30 days, at a glance.",
  },
  {
    icon: Bookmark,
    title: "Bookmark & Revisit",
    body: "Star any insight to save it to a dedicated page, ready whenever you need it.",
  },
  {
    icon: CalendarDays,
    title: "Browse by Date & Topic",
    body: "Insights organized by date and domain — Tech, Business, Health, Finance, and more.",
  },
  {
    icon: Bell,
    title: "Never Miss an Episode",
    body: "New episodes picked up every 4 hours, appearing on your dashboard in real time.",
  },
  {
    icon: Mail,
    title: "On-Demand Digest",
    body: 'One click on "Send Digest Now" and it lands in your inbox instantly.',
  },
  {
    icon: Download,
    title: "Export Your Insights",
    body: "Download a day's insights as PDF, Excel, or Word — great for sharing or archiving.",
  },
  {
    icon: Volume2,
    title: "Listen to Insights",
    body: "Enable Read Aloud and the dashboard reads your cards to you, hands-free.",
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
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      {/* Hero */}
      <div className="relative mb-8 sm:mb-10 text-center">
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

      {/* Footer credit */}
      <div className="mb-10 sm:mb-14 flex justify-center">
        <div
          className="inline-flex items-center gap-3.5 px-5 py-2.5 rounded-full border text-sm sm:text-base"
          style={{ color: "var(--txt-3)", borderColor: "var(--bdr)", background: "var(--bg-card)" }}
        >
          <span className="font-semibold" style={{ color: "var(--txt-1)" }}>Venu Talluri</span>
          <span aria-hidden style={{ color: "var(--bdr)" }}>·</span>
          <a
            href="https://www.linkedin.com/in/venutalluri/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
            style={{ color: "#0A66C2" }}
          >
            <LinkedInIcon className="w-5 h-5" />
            <span className="sr-only">Connect on LinkedIn</span>
          </a>
          <a
            href="https://github.com/vtghub"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
            style={{ color: "var(--txt-1)" }}
          >
            <GitHubIcon className="w-5 h-5" />
            <span className="sr-only">View on GitHub</span>
          </a>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3.5 mb-8 sm:mb-12">
        {features.map(({ icon: Icon, title, body }, i) => {
          const dk = DOMAIN_KEYS[i % DOMAIN_KEYS.length];
          return (
            <div
              key={title}
              className="flex items-start gap-3 px-3.5 py-3 sm:p-4 rounded-xl border card-lift"
              style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
            >
              <div
                className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center mt-0.5"
                style={{ background: `var(--d-${dk}-bg)` }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: `var(--d-${dk}-txt)` }} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-sm leading-snug mb-0.5" style={{ color: "var(--txt-1)" }}>
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
        className="flex items-start gap-3 px-3.5 py-3 sm:p-5 rounded-xl border mb-8 sm:mb-12"
        style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center mt-0.5"
          style={{ background: "var(--acc-bg, rgba(194,65,12,0.08))" }}
        >
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--acc)" }} />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold text-sm sm:text-base leading-snug mb-0.5" style={{ color: "var(--txt-1)" }}>
            Powered by Free AI Models
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed mb-2.5" style={{ color: "var(--txt-3)" }}>
            Every AI feature runs on a free-tier model waterfall — if one provider's out of quota, the next
            takes over automatically, no paid subscriptions involved. Dictionary Lookup is the exception:
            pure WordNet retrieval, no AI call at all.
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

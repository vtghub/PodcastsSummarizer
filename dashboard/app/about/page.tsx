import Link from "next/link";
import { Mic2, Search, Bookmark, CalendarDays, Bell, Mail, Volume2 } from "lucide-react";

const features = [
  {
    icon: Mic2,
    title: "Daily Digest Email",
    body: "Every morning you get a personalized email with key takeaways from only the podcasts you follow. No fluff, just the insights that matter to you.",
  },
  {
    icon: Search,
    title: "Instant Search",
    body: "Can't remember which episode covered a topic? Search across everything — by keyword, guest name, podcast channel, or episode title — and jump straight to the card.",
  },
  {
    icon: Bookmark,
    title: "Bookmark & Revisit",
    body: "Star any insight to save it. Your bookmarks live on a dedicated page so you can come back to the best ideas anytime.",
  },
  {
    icon: CalendarDays,
    title: "Browse by Date & Topic",
    body: "The dashboard organizes insights by date and domain — Technology & AI, Business, Health, Finance, and more — so you can catch up on what you missed.",
  },
  {
    icon: Bell,
    title: "Never Miss an Episode",
    body: "Fresh episodes are picked up every 4 hours and added to your feed automatically. New cards appear on your dashboard in real time — no refresh needed.",
  },
  {
    icon: Mail,
    title: "Send Digest On Demand",
    body: 'Want your digest right now? Hit "Send Digest Now" from your profile and it lands in your inbox instantly.',
  },
  {
    icon: Volume2,
    title: "Listen to Insights",
    body: "Short on time? Enable Read Aloud and the dashboard reads the cards to you.",
  },
];

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      {/* Hero */}
      <div className="mb-14 text-center">
        <div className="text-5xl mb-4">🎙</div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: "var(--txt-1)" }}>
          Podcast Insights
        </h1>
        <p className="text-base sm:text-lg leading-relaxed max-w-xl mx-auto" style={{ color: "var(--txt-3)" }}>
          A personal knowledge system that listens to your podcasts, extracts what matters, and delivers it straight to you — daily, searchable, and always up to date.
        </p>
      </div>

      {/* Features */}
      <div className="space-y-6 mb-14">
        {features.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex gap-4 p-5 rounded-xl border card-lift"
            style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
          >
            <div
              className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "var(--acc-bg, rgba(194,65,12,0.08))" }}
            >
              <Icon className="w-5 h-5" style={{ color: "var(--acc)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-base mb-1" style={{ color: "var(--txt-1)" }}>
                {title}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--txt-3)" }}>
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        className="text-center rounded-2xl border px-6 py-10"
        style={{ background: "var(--bg-card)", borderColor: "var(--bdr)" }}
      >
        <p className="text-base mb-6" style={{ color: "var(--txt-2)" }}>
          Getting started is simple — pick the podcasts you care about, subscribe, and let the system do the rest.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--acc)", color: "var(--acc-txt, #fff)" }}
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

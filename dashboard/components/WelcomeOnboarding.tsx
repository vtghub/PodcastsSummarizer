import Link from "next/link";
import { Headphones, Rss, Sparkles, ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: Rss,
    num: "1",
    title: "Browse the catalog",
    body: "Explore podcasts across Tech, Business, Science, and more. Find shows you already love or discover new ones.",
  },
  {
    icon: Headphones,
    num: "2",
    title: "Subscribe to shows",
    body: "Hit Subscribe on any podcast. The pipeline will start processing new episodes automatically.",
  },
  {
    icon: Sparkles,
    num: "3",
    title: "Get daily insights",
    body: "Every morning you'll receive an email digest with the key ideas from each new episode.",
  },
] as const;

export default function WelcomeOnboarding({ displayName }: { displayName?: string | null }) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center">
      {/* Heading */}
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
        style={{ background: "var(--acc-bg)" }}
      >
        <Sparkles className="w-8 h-8" style={{ color: "var(--acc)" }} />
      </div>

      <h1 className="text-3xl font-bold mb-3" style={{ color: "var(--txt-1)" }}>
        Welcome{displayName ? `, ${displayName}` : ""}!
      </h1>
      <p className="text-base mb-10" style={{ color: "var(--txt-3)" }}>
        You&apos;re all set. Here&apos;s how to get your first podcast insights.
      </p>

      {/* Steps */}
      <div className="grid gap-4 mb-10 text-left">
        {STEPS.map(({ icon: Icon, num, title, body }) => (
          <div
            key={num}
            className="flex items-start gap-4 p-5 rounded-xl border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
          >
            <div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: "var(--acc-bg)", color: "var(--acc)" }}
            >
              {num}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--acc)" }} />
                <p className="font-semibold text-sm" style={{ color: "var(--txt-1)" }}>{title}</p>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--txt-3)" }}>{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
        style={{ background: "var(--acc)", color: "#fff" }}
      >
        Set up my feed
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

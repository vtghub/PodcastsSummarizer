import { notFound } from "next/navigation";
import { getInsightById } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { getDomainColor } from "@/lib/domain-colors";
import InsightCard from "@/components/InsightCard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InsightDetailPage({ params }: Props) {
  const { id } = await params;
  const [insight, userId] = await Promise.all([getInsightById(id), getUserId()]);

  if (!insight) notFound();

  const domainColor = getDomainColor(insight.domain);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back navigation */}
      <Link
        href={`/dashboard?date=${insight.date}&domain=${encodeURIComponent(insight.domain)}#insight-${insight.id}`}
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: "var(--txt-4)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {insight.date}
      </Link>

      {/* Domain label */}
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--txt-4)" }}>
        {insight.domain}
      </p>

      <InsightCard
        insight={insight}
        domainColor={domainColor}
        isAuthed={!!userId}
      />
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const insight = await getInsightById(id);
  if (!insight) return { title: "Insight not found" };
  const title = insight.episode_title ?? insight.source_name ?? "Podcast Insight";
  return {
    title: `${title} — Podcast Insights`,
    description: insight.summary?.slice(0, 160),
  };
}

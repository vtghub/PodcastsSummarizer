"use client";

import type { Insight } from "@/lib/db";
import InsightCard from "@/components/InsightCard";
import { getDomainColor } from "@/lib/domain-colors";
import { Bookmark } from "lucide-react";

export default function SavedInsightsList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border"
        style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}
      >
        <Bookmark className="w-10 h-10 mb-4" style={{ color: "var(--txt-4)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--txt-3)" }}>No saved insights yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--txt-4)" }}>
          Click the bookmark icon on any insight card to save it here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {insights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          domainColor={getDomainColor(insight.domain)}
          isAuthed={true}
        />
      ))}
    </div>
  );
}

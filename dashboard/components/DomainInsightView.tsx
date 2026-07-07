"use client";

import { useState } from "react";
import type { Insight } from "@/lib/db";
import { getDomainColor, DOMAINS as DOMAIN_ORDER } from "@/lib/domain-colors";
import InsightCard from "@/components/InsightCard";

const DEFAULT_DOMAIN = "Business & Startups";

interface Props {
  byDomain: Record<string, Insight[]>;
  isAuthed: boolean;
}

export default function DomainInsightView({ byDomain, isAuthed }: Props) {
  const domains = DOMAIN_ORDER.filter((d) => byDomain[d]);
  const initialDomain =
    domains.includes(DEFAULT_DOMAIN) ? DEFAULT_DOMAIN : domains[0];
  const [selected, setSelected] = useState(initialDomain);

  const insights = byDomain[selected] ?? [];
  const color = getDomainColor(selected);

  return (
    <div>
      {/* Domain tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {domains.map((domain) => {
          const c = getDomainColor(domain);
          const active = domain === selected;
          return (
            <button
              key={domain}
              onClick={() => setSelected(domain)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                active ? `${c.bg} ${c.text} ${c.border} shadow-sm` : "opacity-50 hover:opacity-80"
              }`}
              style={
                active
                  ? {}
                  : { background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }
              }
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {domain}
              <span className={active ? "opacity-70" : "opacity-50"}>
                ({byDomain[domain].length})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active domain heading */}
      <div className="flex items-center gap-3 mb-5">
        <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
        <h2 className={`text-sm font-bold uppercase tracking-widest ${color.text}`}>
          {selected}
        </h2>
        <div className="flex-1 h-px" style={{ background: "var(--bdr)" }} />
        <span className="text-xs" style={{ color: "var(--txt-4)" }}>
          {insights.length} episode{insights.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} domainColor={color} isAuthed={isAuthed} />
        ))}
      </div>
    </div>
  );
}

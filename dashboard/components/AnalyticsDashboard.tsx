"use client";

import Link from "next/link";
import type { AnalyticsData } from "@/lib/analytics";
import { getDomainColor } from "@/lib/domain-colors";

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const { totals, insights_by_day, domain_stats, top_insights } = data;

  const maxDayCount = Math.max(...insights_by_day.map((d) => d.count), 1);
  const maxDomainInsights = Math.max(...domain_stats.map((d) => d.insights), 1);

  // SVG bar chart dimensions
  const chartW = 600;
  const chartH = 120;
  const barGap = 2;
  const barW = insights_by_day.length > 0
    ? Math.max(2, Math.floor((chartW - barGap * insights_by_day.length) / insights_by_day.length))
    : 4;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Insights", value: totals.insights },
          { label: "Total Views", value: totals.views },
          { label: "Subscribed Sources", value: totals.sources },
          { label: "Days with Insights", value: totals.days },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
          >
            <p className="text-xs mb-1" style={{ color: "var(--txt-4)" }}>{label}</p>
            <p className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Insights per day */}
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-2)" }}>
          Insights per Day (last {insights_by_day.length} days)
        </h2>
        {insights_by_day.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--txt-4)" }}>No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${chartW} ${chartH + 20}`} className="w-full" style={{ minWidth: 280, maxHeight: 160 }}>
              {insights_by_day.map((d, i) => {
                const barH = Math.max(2, Math.round((d.count / maxDayCount) * chartH));
                const x = i * (barW + barGap);
                const y = chartH - barH;
                return (
                  <g key={d.date}>
                    <rect
                      x={x} y={y} width={barW} height={barH}
                      fill="var(--acc)" opacity={0.8} rx={1}
                    />
                    <title>{d.date}: {d.count} insight{d.count !== 1 ? "s" : ""}</title>
                  </g>
                );
              })}
              {/* X-axis baseline */}
              <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="var(--bdr)" strokeWidth={1} />
              {/* First and last date labels */}
              {insights_by_day.length > 0 && (
                <>
                  <text x={0} y={chartH + 14} fontSize={9} fill="var(--txt-4)">
                    {insights_by_day[0].date.slice(5)}
                  </text>
                  <text
                    x={chartW}
                    y={chartH + 14}
                    fontSize={9}
                    fill="var(--txt-4)"
                    textAnchor="end"
                  >
                    {insights_by_day[insights_by_day.length - 1].date.slice(5)}
                  </text>
                </>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* Domain breakdown */}
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-2)" }}>
          Domain Breakdown
        </h2>
        {domain_stats.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--txt-4)" }}>No data yet.</p>
        ) : (
          <div className="space-y-2">
            {domain_stats.map((d) => {
              const colors = getDomainColor(d.domain);
              const pct = Math.round((d.insights / maxDomainInsights) * 100);
              return (
                <div key={d.domain}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`font-medium ${colors.text}`}>{d.domain}</span>
                    <span style={{ color: "var(--txt-4)" }}>
                      {d.insights} insight{d.insights !== 1 ? "s" : ""} · {d.views} view{d.views !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--bg-base)" }}>
                    <div
                      className={`h-2 rounded-full ${colors.dot}`}
                      style={{ width: `${pct}%`, transition: "width 0.3s ease" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top insights by views */}
      <div
        className="rounded-xl border p-4"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)" }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-2)" }}>
          Most Viewed Insights
        </h2>
        {top_insights.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--txt-4)" }}>No views recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {top_insights.map((ins, idx) => {
              const colors = getDomainColor(ins.domain);
              return (
                <Link
                  key={ins.id}
                  href={`/dashboard?date=${ins.date}&domain=${encodeURIComponent(ins.domain)}&insight=${ins.id}`}
                  className="flex items-start gap-3 p-2 rounded-lg hover:opacity-80 transition-opacity"
                  style={{ background: "var(--bg-base)" }}
                >
                  <span
                    className="text-xs font-mono w-5 text-center mt-0.5 shrink-0"
                    style={{ color: "var(--txt-4)" }}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs line-clamp-2" style={{ color: "var(--txt-2)" }}>{ins.summary}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--txt-4)" }}>
                      <span className={`font-medium ${colors.text}`}>{ins.domain}</span>
                      {" · "}{ins.source_name}{" · "}{ins.date}
                    </p>
                  </div>
                  <span
                    className="text-xs font-medium shrink-0"
                    style={{ color: "var(--acc)" }}
                  >
                    {ins.views} 👁
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

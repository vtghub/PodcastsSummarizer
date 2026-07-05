import { getInsightsByDate, getAvailableDates, type Insight } from "@/lib/db";
import { getDomainColor } from "@/lib/domain-colors";
import DateNav from "@/components/DateNav";
import InsightCard from "@/components/InsightCard";
import EmptyState from "@/components/EmptyState";
import { format, parseISO } from "date-fns";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date } = await searchParams;
  const today = format(new Date(), "yyyy-MM-dd");
  const selectedDate = date ?? today;

  let insights: Insight[] = [];
  let availableDates: string[] = [];
  let dbError = false;

  try {
    [insights, availableDates] = await Promise.all([
      getInsightsByDate(selectedDate),
      getAvailableDates(),
    ]);
  } catch {
    dbError = true;
  }

  const byDomain = insights.reduce<Record<string, Insight[]>>((acc, ins) => {
    (acc[ins.domain] ??= []).push(ins);
    return acc;
  }, {});

  const formattedDate = (() => {
    try { return format(parseISO(selectedDate), "EEEE, MMMM d, yyyy"); }
    catch { return selectedDate; }
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Daily Insights</h1>
          <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>{formattedDate}</p>
        </div>
        <DateNav selectedDate={selectedDate} availableDates={availableDates} />
      </div>

      {/* Domain summary chips */}
      {Object.keys(byDomain).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {Object.entries(byDomain).map(([domain, list]) => {
            const color = getDomainColor(domain);
            return (
              <a
                key={domain}
                href={`#${encodeURIComponent(domain)}`}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border hover:opacity-80 transition-opacity ${color.bg} ${color.text} ${color.border}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                {domain}
                <span className="opacity-60">({list.length})</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Content */}
      {dbError ? (
        <EmptyState
          icon="⚠️"
          title="Database not found"
          message="Run the Python worker at least once to create the database."
          hint="python scripts/manage_podcasts.py run"
        />
      ) : insights.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No insights for this date"
          message={`No podcast insights were processed on ${formattedDate}.`}
          hint="Run the pipeline or select a date that has data."
        />
      ) : (
        <div className="space-y-12">
          {Object.entries(byDomain).map(([domain, list]) => {
            const color = getDomainColor(domain);
            return (
              <section key={domain} id={encodeURIComponent(domain)}>
                <div className="flex items-center gap-3 mb-5">
                  <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                  <h2 className={`text-sm font-bold uppercase tracking-widest ${color.text}`}>{domain}</h2>
                  <div className="flex-1 h-px" style={{ background: "var(--bdr)" }} />
                  <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                    {list.length} episode{list.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  {list.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} domainColor={color} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

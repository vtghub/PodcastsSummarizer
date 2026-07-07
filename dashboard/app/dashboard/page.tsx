import { getInsightsByDate, getAvailableDates, type Insight } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import DateNav from "@/components/DateNav";
import DomainInsightView from "@/components/DomainInsightView";
import EmptyState from "@/components/EmptyState";
import { format, parseISO } from "date-fns";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date } = await searchParams;
  const today = format(new Date(), "yyyy-MM-dd");
  const selectedDate = date ?? today;
  const userId = await getUserId();

  let insights: Insight[] = [];
  let availableDates: string[] = [];
  let dbError = false;

  try {
    [insights, availableDates] = await Promise.all([
      getInsightsByDate(selectedDate, userId),
      getAvailableDates(userId),
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Daily Insights</h1>
          <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>{formattedDate}</p>
        </div>
        <DateNav selectedDate={selectedDate} availableDates={availableDates} />
      </div>

      {/* Guest banner */}
      {!userId && !dbError && (
        <div
          className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border text-sm"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }}
        >
          <span>👋</span>
          <span>
            Showing all public podcast insights.{" "}
            <Link href="/login?from=/dashboard" className="font-medium hover:underline" style={{ color: "var(--acc)" }}>
              Sign in
            </Link>{" "}
            to see only your subscribed podcasts.
          </span>
        </div>
      )}

      {/* No-subscriptions nudge for logged-in users with empty results */}
      {userId && !dbError && insights.length === 0 && availableDates.length === 0 && (
        <div
          className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border text-sm"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }}
        >
          <span>📻</span>
          <span>
            You haven&apos;t subscribed to any podcasts yet.{" "}
            <Link href="/podcasts" className="font-medium hover:underline" style={{ color: "var(--acc)" }}>
              Browse the catalog
            </Link>{" "}
            to get started.
          </span>
        </div>
      )}

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
          hint={userId ? "Run the pipeline or select a date that has data." : "Run the pipeline or select a date that has data."}
        />
      ) : (
        <DomainInsightView key={selectedDate} byDomain={byDomain} />
      )}
    </div>
  );
}

import { getInsightsByDate, getAvailableDates, getUserSubscriptions, getUserTimezone, type Insight } from "@/lib/db";
import { getUserId, getDisplayName } from "@/lib/auth";
import { redirect } from "next/navigation";
import LocalDateGuard from "@/components/LocalDateGuard";
import DateNav from "@/components/DateNav";
import ExportDropdown from "@/components/ExportDropdown";
import DomainInsightView from "@/components/DomainInsightView";
import EmptyState from "@/components/EmptyState";
import VisitStamp from "@/components/VisitStamp";
import WelcomeOnboarding from "@/components/WelcomeOnboarding";
import { format, parseISO } from "date-fns";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ date?: string; domain?: string; insight?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { date, domain, insight } = await searchParams;
  const userId = await getUserId();

  // Compute "today" in the user's local timezone so the dashboard doesn't
  // flip to the next day when Vercel's UTC clock is ahead of the user's clock.
  // For guests, fall back to UTC; the LocalDateGuard component below will
  // correct it client-side once the browser knows the real local date.
  const userTz = userId ? await getUserTimezone(userId) : "UTC";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: userTz });
  const selectedDate = date ?? today;

  // Redirect new users (no subscriptions) to onboarding wizard.
  // redirect() throws internally, so the subscription fetch must be
  // awaited inside its own try/catch — calling redirect() from within a
  // try/catch would silently swallow the redirect's thrown signal.
  if (userId) {
    let subs: string[] = [];
    let subsCheckFailed = false;
    try {
      subs = await getUserSubscriptions(userId);
    } catch {
      subsCheckFailed = true; // if subscription check fails, continue to dashboard normally
    }
    if (!subsCheckFailed && subs.length === 0) redirect("/onboarding");
  }

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

  const isNewUser = !!userId && !dbError && insights.length === 0 && availableDates.length === 0;

  const byDomain = insights.reduce<Record<string, Insight[]>>((acc, ins) => {
    (acc[ins.domain] ??= []).push(ins);
    return acc;
  }, {});

  const formattedDate = (() => {
    try { return format(parseISO(selectedDate), "EEEE, MMMM d, yyyy"); }
    catch { return selectedDate; }
  })();

  const displayName = isNewUser ? await getDisplayName() : null;

  return (
    <div>
      {/* Silently navigate to the correct local date if the server's timezone
          guess doesn't match the browser's actual local date */}
      {!date && <LocalDateGuard serverDate={today} />}
      {userId && <VisitStamp />}

      {/* Onboarding — new signed-in users with no subscriptions */}
      {isNewUser && <WelcomeOnboarding displayName={displayName} />}

      {!isNewUser && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Daily Insights</h1>
              <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>{formattedDate}</p>
            </div>
            <div className="flex items-center gap-2">
              {userId && <ExportDropdown date={selectedDate} />}
              <DateNav selectedDate={selectedDate} availableDates={availableDates} />
            </div>
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

          {dbError ? (
            <EmptyState
              icon="⚠️"
              title="Database not found"
              message="Run the Python worker at least once to create the database."
              hint="python scripts/manage_podcasts.py run"
            />
          ) : insights.length === 0 ? (
            selectedDate === today ? (
              <EmptyState
                icon="⏳"
                title="Today's insights aren't ready yet"
                message="Podcasts are processed automatically throughout the day — check back in a bit, or browse a previous day using the date picker above."
              />
            ) : (
              <EmptyState
                icon="📭"
                title="No insights for this date"
                message={`No podcast insights were processed on ${formattedDate}. Try a different date.`}
              />
            )
          ) : (
            <DomainInsightView key={`${selectedDate}-${domain ?? ""}`} byDomain={byDomain} isAuthed={!!userId} initialDomain={domain} initialInsightId={insight} />
          )}
        </>
      )}
    </div>
  );
}

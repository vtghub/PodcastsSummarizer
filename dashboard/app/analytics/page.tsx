import { getUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnalytics } from "@/lib/analytics";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export default async function AnalyticsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?from=/analytics");

  const data = await getAnalytics(userId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Analytics</h1>
        <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
          Insights from your subscribed podcasts
        </p>
      </div>
      <AnalyticsDashboard data={data} />
    </div>
  );
}

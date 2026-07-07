import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { getUserSubscriptions, getPublicSourcesAsync } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";
import SignOutButton from "@/components/SignOutButton";
import SendDigestButton from "@/components/SendDigestButton";
import EpisodeDigestPicker from "@/components/EpisodeDigestPicker";

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login?from=/profile");

  const sb = getSupabaseClient();
  const [{ data: profile }, subscribedIds, allSources] = await Promise.all([
    sb.from("user_profiles")
      .select("display_name, digest_enabled, digest_hour, digest_domains")
      .eq("user_id", user.id)
      .single(),
    getUserSubscriptions(user.id),
    getPublicSourcesAsync(),
  ]);

  const subscribedSources = allSources.filter((s) => subscribedIds.includes(s.id));

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "var(--txt-1)" }}>Profile</h1>
          <p className="text-sm" style={{ color: "var(--txt-4)" }}>{user.email}</p>
        </div>
        <SignOutButton />
      </div>

      {/* Two-column on md+, single column on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* Left — Account + Daily Digest settings */}
        <ProfileForm
          initialDisplayName={profile?.display_name ?? ""}
          initialDigestEnabled={profile?.digest_enabled ?? true}
          initialDigestHour={profile?.digest_hour ?? 19}
          initialDigestDomains={(profile as { digest_domains?: string[] | null })?.digest_domains ?? null}
        />

        {/* Right — Digest actions */}
        <div className="space-y-5">
          {/* Email Digest */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>Email Digest</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm" style={{ color: "var(--txt-3)" }}>
                Send your personalized digest right now based on your current subscriptions.
              </p>
              <SendDigestButton />
            </div>
          </div>

          {/* Episode Digest */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="px-5 py-4 border-b" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)" }}>Episode Digest</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm" style={{ color: "var(--txt-3)" }}>
                Pick a specific podcast and episode to get a targeted digest email.
                Episodes marked ✓ send instantly; unprocessed episodes (○) are queued for analysis first.
              </p>
              {subscribedSources.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--txt-4)" }}>
                  Subscribe to podcasts on the{" "}
                  <a href="/podcasts" style={{ color: "var(--acc)" }}>My Podcasts</a> page first.
                </p>
              ) : (
                <EpisodeDigestPicker subscribedSources={subscribedSources} />
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

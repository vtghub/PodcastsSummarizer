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
      .select("display_name, digest_enabled, digest_hour")
      .eq("user_id", user.id)
      .single(),
    getUserSubscriptions(user.id),
    getPublicSourcesAsync(),
  ]);

  const subscribedSources = allSources.filter((s) => subscribedIds.includes(s.id));

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--txt-1)" }}>Profile</h1>
          <p className="text-sm" style={{ color: "var(--txt-3)" }}>{user.email}</p>
        </div>
        <SignOutButton />
      </div>
      <ProfileForm
        initialDisplayName={profile?.display_name ?? ""}
        initialDigestEnabled={profile?.digest_enabled ?? true}
        initialDigestHour={profile?.digest_hour ?? 19}
      />

      <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--bdr)" }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--txt-2)" }}>Email Digest</h2>
        <p className="text-xs mb-4" style={{ color: "var(--txt-4)" }}>
          Send your personalized digest right now based on your current subscriptions.
        </p>
        <SendDigestButton />
      </div>

      <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--bdr)" }}>
        <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--txt-2)" }}>Episode Digest</h2>
        <p className="text-xs mb-4" style={{ color: "var(--txt-4)" }}>
          Pick a specific podcast and episode to get a targeted digest email.
          Episodes marked ✓ send instantly; unprocessed episodes (○) are queued for analysis first.
        </p>
        {subscribedSources.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--txt-4)" }}>
            Subscribe to podcasts on the{" "}
            <a href="/podcasts" style={{ color: "var(--acc)" }}>My Podcasts</a> page first.
          </p>
        ) : (
          <EpisodeDigestPicker subscribedSources={subscribedSources} />
        )}
      </div>
    </div>
  );
}

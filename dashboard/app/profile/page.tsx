import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import ProfileForm from "@/components/ProfileForm";

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login?from=/profile");

  const sb = getSupabaseClient();
  const { data: profile } = await sb
    .from("user_profiles")
    .select("display_name, digest_enabled, digest_hour")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--txt-1)" }}>Profile</h1>
      <p className="text-sm mb-8" style={{ color: "var(--txt-3)" }}>{user.email}</p>
      <ProfileForm
        initialDisplayName={profile?.display_name ?? ""}
        initialDigestEnabled={profile?.digest_enabled ?? true}
        initialDigestHour={profile?.digest_hour ?? 19}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { getUserSubscriptions } from "@/lib/db";
import OnboardingWizard from "@/components/OnboardingWizard";

export default async function OnboardingPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  // Already has subscriptions — they've been through onboarding
  const subs = await getUserSubscriptions(userId);
  if (subs.length > 0) redirect("/dashboard");

  return <OnboardingWizard />;
}

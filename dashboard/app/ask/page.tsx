import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getUserSubscriptions, getPublicSourcesAsync } from "@/lib/db";
import AskChat from "@/components/AskChat";

export default async function AskPage() {
  const user = await getUser();
  if (!user) redirect("/login?from=/ask");

  const [subscribedIds, allSources] = await Promise.all([
    getUserSubscriptions(user.id),
    getPublicSourcesAsync(),
  ]);
  const subscribedSources = allSources.filter((s) => subscribedIds.includes(s.id));

  return <AskChat subscribedSources={subscribedSources} />;
}

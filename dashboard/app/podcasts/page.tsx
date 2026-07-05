import { getPublicSourcesAsync, getUserSubscriptions, type Source } from "@/lib/db";
import { getUser, isAdmin } from "@/lib/auth";
import PodcastManager from "@/components/PodcastManager";

export default async function PodcastsPage() {
  const user = await getUser();
  const userId = user?.id ?? null;
  const [sources, subscribedIds, adminUser] = await Promise.all([
    getPublicSourcesAsync().catch(() => [] as Source[]),
    userId ? getUserSubscriptions(userId) : Promise.resolve([] as string[]),
    isAdmin(),
  ]);

  return (
    <PodcastManager
      sources={sources}
      subscribedIds={subscribedIds}
      isAuthed={Boolean(userId)}
      isAdmin={adminUser}
    />
  );
}

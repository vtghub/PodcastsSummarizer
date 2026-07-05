import { getSourcesAsync, type Source } from "@/lib/db";
import { getUser } from "@/lib/auth";
import PodcastManager from "@/components/PodcastManager";

export default async function PodcastsPage() {
  const user = await getUser();
  const isAuthed = Boolean(user);

  let sources: Source[] = [];
  let dbError = false;

  try {
    sources = await getSourcesAsync();
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-5 py-4 text-sm text-amber-300 mt-8">
        Database not found. Run the Python worker at least once to create it.
      </div>
    );
  }

  return <PodcastManager sources={sources} isAuthed={isAuthed} />;
}

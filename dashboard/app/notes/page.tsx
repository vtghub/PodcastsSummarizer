import { getUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import MyNotesList, { type EpisodeNoteGroup } from "@/components/MyNotesList";

async function getEpisodeNoteGroups(userId: string): Promise<EpisodeNoteGroup[]> {
  const supabase = getSupabaseClient();

  const { data: notes } = await supabase
    .from("episode_notes")
    .select("id, episode_id, body, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (!notes || notes.length === 0) return [];

  const episodeIds = [...new Set(notes.map((n) => n.episode_id))];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: episodeRows } = await (supabase as any)
    .from("episodes")
    .select("id, title, title_en, published_at, source_id, sources(name, domain)")
    .in("id", episodeIds);

  const episodeById = new Map((episodeRows ?? []).map((e: { id: string }) => [e.id, e]));

  // Preserve most-recently-updated-note-first order across episodes
  const order: string[] = [];
  const notesByEpisode = new Map<string, typeof notes>();
  for (const n of notes) {
    if (!notesByEpisode.has(n.episode_id)) {
      notesByEpisode.set(n.episode_id, []);
      order.push(n.episode_id);
    }
    notesByEpisode.get(n.episode_id)!.push(n);
  }

  return order.map((episodeId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ep = episodeById.get(episodeId) as any;
    const src = ep?.sources as { name?: string; domain?: string } | null;
    return {
      episode_id: episodeId,
      episode_title: (ep?.title_en || ep?.title) ?? "Untitled episode",
      episode_published_at: ep?.published_at ?? null,
      source_name: src?.name ?? null,
      domain: src?.domain ?? "Other",
      notes: notesByEpisode.get(episodeId)!.map((n) => ({
        id: n.id,
        body: n.body,
        created_at: n.created_at,
        updated_at: n.updated_at,
      })),
    } satisfies EpisodeNoteGroup;
  });
}

export default async function NotesPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?from=/notes");

  const groups = await getEpisodeNoteGroups(userId);
  const noteCount = groups.reduce((n, g) => n + g.notes.length, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>My Notes</h1>
        <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
          {groups.length === 0
            ? "Add notes from the notes icon on any insight card to find them here."
            : `${noteCount} note${noteCount !== 1 ? "s" : ""} across ${groups.length} episode${groups.length !== 1 ? "s" : ""}`}
        </p>
      </div>
      <MyNotesList groups={groups} />
    </div>
  );
}

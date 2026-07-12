"""
One-time seed: loads the Princeton WordNet English lexical database into
Supabase (dictionary_entries table, migration 022) for the dashboard's
insight-card word-lookup feature — a direct, local retrieval lookup at
request time (no LLM call, no external API dependency).

WordNet is a standard free/open lexical database (~130k word-sense entries
after filtering to single-word, alphabetic lemmas) — permissive license,
downloaded once via NLTK on first run (~10MB).

Idempotent: re-running is safe, ON CONFLICT DO NOTHING skips rows already
inserted (unique on word+pos+definition).

Run locally:
    python -m worker.jobs.seed_dictionary

Or trigger via GitHub Actions:
    Actions → Seed Dictionary → Run workflow
"""

import psycopg2
import psycopg2.extras

from worker.config.settings import SUPABASE_DB_URL

POS_LABELS = {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}


def _ensure_wordnet_downloaded() -> None:
    import nltk
    try:
        from nltk.corpus import wordnet as wn
        wn.synsets("test")
    except LookupError:
        print("[SeedDictionary] downloading WordNet corpus (~10MB, one-time)...")
        nltk.download("wordnet")
        nltk.download("omw-1.4")


def _extract_entries() -> list[tuple[str, str, str, list[str], list[str]]]:
    """Returns (word, pos, definition, examples, synonyms) tuples — one per
    (word, part-of-speech, definition) triple, deduplicated. Skips
    multi-word/non-alphabetic lemmas (e.g. "united_states") since this
    feature looks up single words found in insight card text."""
    from nltk.corpus import wordnet as wn

    rows: list[tuple[str, str, str, list[str], list[str]]] = []
    seen: set[tuple[str, str, str]] = set()

    for synset in wn.all_synsets():
        pos = POS_LABELS.get(synset.pos())
        if not pos:
            continue
        lemma_names = [l.name() for l in synset.lemmas() if l.name().isalpha()]
        if not lemma_names:
            continue
        definition = synset.definition()
        examples = synset.examples()[:3]
        for lemma in lemma_names:
            word = lemma.lower()
            key = (word, pos, definition)
            if key in seen:
                continue
            seen.add(key)
            synonyms = sorted({l.lower() for l in lemma_names if l != lemma})[:8]
            rows.append((word, pos, definition, examples, synonyms))

    return rows


def seed_dictionary(batch_size: int = 5000) -> dict:
    _ensure_wordnet_downloaded()
    rows = _extract_entries()
    unique_words = len({r[0] for r in rows})
    print(f"[SeedDictionary] extracted {len(rows)} entries ({unique_words} unique words)")

    inserted = 0
    with psycopg2.connect(SUPABASE_DB_URL) as conn:
        with conn.cursor() as cur:
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO dictionary_entries (word, pos, definition, examples, synonyms)
                    VALUES %s
                    ON CONFLICT (word, pos, definition) DO NOTHING
                    """,
                    batch,
                )
                inserted += len(batch)
                print(f"[SeedDictionary] processed {inserted}/{len(rows)}...")
        conn.commit()

    print(f"[SeedDictionary] done — {len(rows)} entries processed")
    return {"entries": len(rows)}


if __name__ == "__main__":
    seed_dictionary()

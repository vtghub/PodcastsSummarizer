import { vi } from "vitest";

/**
 * Creates a chainable Supabase-like mock where every builder method
 * returns `this`, and the chain itself is thenable so `await chain`
 * resolves to `defaultResult`.  Per-test callers can override
 * individual methods with `vi.mocked(chain.single).mockResolvedValueOnce(...)`.
 */
export function makeChain(defaultResult: unknown = { data: null, error: null, count: null }) {
  const resolved = Promise.resolve(defaultResult);
  const chain: Record<string, unknown> = {
    select:      vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    upsert:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    neq:         vi.fn().mockReturnThis(),
    in:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue(defaultResult),
    maybeSingle: vi.fn().mockResolvedValue(defaultResult),
    // Make the chain itself await-able (Supabase builder pattern)
    then:        resolved.then.bind(resolved),
    catch:       resolved.catch.bind(resolved),
    finally:     resolved.finally.bind(resolved),
  };
  return chain;
}

/**
 * Builds a mock Supabase client whose `from(table)` returns the provided
 * per-table chains, falling back to an empty chain for unlisted tables.
 */
export function makeSupabaseMock(
  tableChains: Record<string, ReturnType<typeof makeChain>> = {}
) {
  return {
    from: vi.fn((table: string) => tableChains[table] ?? makeChain()),
  };
}

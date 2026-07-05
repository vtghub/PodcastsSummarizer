/**
 * Supabase server-side client (service role).
 * Only imported in Server Components and API routes — never in client bundles.
 * Uses the service role key so it bypasses RLS for trusted server reads/writes.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl      = process.env.SUPABASE_URL ?? "";
const supabaseKey      = process.env.SUPABASE_SERVICE_KEY ?? "";

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    }
    _client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

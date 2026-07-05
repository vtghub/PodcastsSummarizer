import type { NextConfig } from "next";

const isSupabase = Boolean(process.env.SUPABASE_URL);

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node module — only needed in local/SQLite mode
  serverExternalPackages: isSupabase ? [] : ["better-sqlite3"],
};

export default nextConfig;

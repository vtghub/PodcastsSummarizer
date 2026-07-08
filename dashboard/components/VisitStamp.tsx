"use client";

import { useEffect } from "react";

// Fires POST /api/profile/visit on dashboard mount to stamp last_visited_at.
// Must be a client component so it runs after hydration (not during SSR).
export default function VisitStamp() {
  useEffect(() => {
    fetch("/api/profile/visit", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}

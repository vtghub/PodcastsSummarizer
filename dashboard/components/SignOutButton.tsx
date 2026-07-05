"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border flex-shrink-0"
      style={{ borderColor: "var(--bdr)", color: "var(--txt-3)", background: "var(--bg-elevated)" }}
    >
      <LogOut className="w-3.5 h-3.5" />
      Sign out
    </button>
  );
}

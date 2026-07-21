"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, ShieldOff, RotateCcw, Trash2, Loader2, Search, Mail, MailX, Users, ChevronDown, ChevronUp, RefreshCw, Bell, BellOff, CalendarCheck, CalendarX, MailCheck, MailMinus } from "lucide-react";
import { getDomainColor, DOMAINS as DOMAIN_ORDER } from "@/lib/domain-colors";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface SubChannel { name: string; domain: string }
interface CatalogSource { id: string; name: string; domain: string }

interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  digest_enabled: boolean;
  weekly_recommendations_enabled: boolean;
  subscription_count: number;
  domains: string[];
  channels: SubChannel[];
  email_confirmed: boolean;
  created_at: string;
  has_profile: boolean;
}

interface UserCatalog {
  sources: CatalogSource[];
  subscribedIds: Set<string>;
}

export default function AdminUsersManager({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);
  const [catalogs, setCatalogs] = useState<Record<string, UserCatalog>>({});
  const [catalogLoading, setCatalogLoading] = useState<string | null>(null);
  const [subBusyKey, setSubBusyKey] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: "error" | "success" = "error") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      const nextUsers: AdminUser[] = data.users;

      if (knownIds.current) {
        const newOnes = nextUsers.filter((u) => !knownIds.current!.has(u.id));
        if (newOnes.length > 0) {
          showToast(
            newOnes.length === 1
              ? `New user registered: ${newOnes[0].email}`
              : `${newOnes.length} new users registered`,
            "success"
          );
        }
      }
      knownIds.current = new Set(nextUsers.map((u) => u.id));

      setUsers(nextUsers);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      if (!opts?.silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Push-based refresh: Supabase Realtime notifies us the instant a new
  // user_profiles row is inserted (registration) or removed (deletion),
  // instead of polling on a timer. Requires migration 016 (admin RLS +
  // user_profiles added to the supabase_realtime publication).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-users")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_profiles" },
        () => load({ silent: true })
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_profiles" },
        () => load({ silent: true })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = (users ?? []).filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q);
  });

  async function toggleAdmin(u: AdminUser) {
    setActionId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: !u.is_admin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, is_admin: !u.is_admin } : x)) ?? null);
      showToast(!u.is_admin ? `${u.email} is now an admin` : `${u.email} is no longer an admin`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setActionId(null);
    }
  }

  async function toggleDigestEnabled(u: AdminUser) {
    setActionId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digest_enabled: !u.digest_enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setUsers((prev) =>
        prev?.map((x) => (x.id === u.id ? { ...x, digest_enabled: !u.digest_enabled } : x)) ?? null
      );
      showToast(
        !u.digest_enabled
          ? `Email digest enabled for ${u.email}`
          : `Email digest disabled for ${u.email}`,
        "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setActionId(null);
    }
  }

  async function toggleWeeklyRecommendations(u: AdminUser) {
    setActionId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_recommendations_enabled: !u.weekly_recommendations_enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setUsers((prev) =>
        prev?.map((x) =>
          x.id === u.id ? { ...x, weekly_recommendations_enabled: !u.weekly_recommendations_enabled } : x
        ) ?? null
      );
      showToast(
        !u.weekly_recommendations_enabled
          ? `${u.email} subscribed to Weekly Recommendations`
          : `${u.email} unsubscribed from Weekly Recommendations`,
        "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setActionId(null);
    }
  }

  async function resetOnboarding(u: AdminUser) {
    setActionId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_onboarding: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset onboarding");
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, subscription_count: 0, domains: [], channels: [] } : x)) ?? null);
      setCatalogs((prev) => {
        const existing = prev[u.id];
        if (!existing) return prev;
        return { ...prev, [u.id]: { ...existing, subscribedIds: new Set() } };
      });
      showToast(`${u.email} will see onboarding on next visit`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to reset onboarding", "error");
    } finally {
      setActionId(null);
    }
  }

  async function deleteUser(u: AdminUser) {
    setActionId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete user");
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
      showToast(`${u.email} deleted`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete user", "error");
    } finally {
      setActionId(null);
      setConfirmDeleteId(null);
    }
  }

  async function toggleExpand(u: AdminUser) {
    const next = expandedId === u.id ? null : u.id;
    setExpandedId(next);
    if (next && !catalogs[u.id]) {
      setCatalogLoading(u.id);
      try {
        const res = await fetch(`/api/admin/users/${u.id}/subscriptions`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load subscriptions");
        setCatalogs((prev) => ({
          ...prev,
          [u.id]: { sources: data.sources, subscribedIds: new Set(data.subscribedIds) },
        }));
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Failed to load subscriptions", "error");
      } finally {
        setCatalogLoading(null);
      }
    }
  }

  // Recompute a user's domains/channels/subscription_count from a catalog's
  // subscribedIds so the collapsed summary line stays in sync with edits
  // made in the subscription manager below.
  function syncUserFromCatalog(userId: string, catalog: UserCatalog) {
    const subscribed = catalog.sources.filter((s) => catalog.subscribedIds.has(s.id));
    const domains = Array.from(new Set(subscribed.map((s) => s.domain))).sort();
    const channels = subscribed.map((s) => ({ name: s.name, domain: s.domain }));
    setUsers((prev) =>
      prev?.map((x) =>
        x.id === userId
          ? { ...x, subscription_count: subscribed.length, domains, channels }
          : x
      ) ?? null
    );
  }

  async function toggleUserSubscription(u: AdminUser, source: CatalogSource, currentlySubscribed: boolean) {
    const key = `${u.id}:${source.id}`;
    setSubBusyKey(key);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/subscriptions`, {
        method: currentlySubscribed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update subscription");

      setCatalogs((prev) => {
        const existing = prev[u.id];
        if (!existing) return prev;
        const subscribedIds = new Set(existing.subscribedIds);
        if (currentlySubscribed) subscribedIds.delete(source.id);
        else subscribedIds.add(source.id);
        const updated = { ...existing, subscribedIds };
        syncUserFromCatalog(u.id, updated);
        return { ...prev, [u.id]: updated };
      });

      showToast(
        currentlySubscribed
          ? `Unsubscribed ${u.email} from ${source.name}`
          : `Subscribed ${u.email} to ${source.name}`,
        "success"
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update subscription", "error");
    } finally {
      setSubBusyKey(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6" style={{ color: "var(--acc)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Manage Users</h1>
        </div>
        <button
          onClick={() => load()}
          disabled={refreshing}
          title="Refresh user list"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
          style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--txt-3)" }}>
        {users ? `${users.length} user${users.length !== 1 ? "s" : ""} · updates live` : "Loading…"}
      </p>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--txt-4)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full pl-9 pr-3 py-2 rounded-xl text-sm border outline-none"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-1)" }}
        />
      </div>

      {loadError && (
        <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{loadError}</p>
      )}

      {!users && !loadError && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
        </div>
      )}

      {users && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: "var(--txt-4)" }}>No users match your search.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--bdr)" }}>
              {filtered.map((u) => {
                const busy = actionId === u.id;
                const isSelf = u.id === currentUserId;
                const expanded = expandedId === u.id;
                const channelsByDomain = u.channels.reduce<Record<string, string[]>>((acc, c) => {
                  (acc[c.domain] ??= []).push(c.name);
                  return acc;
                }, {});
                return (
                  <div key={u.id} style={{ borderColor: "var(--bdr)" }}>
                  <div className="flex items-center gap-4 px-4 py-3">
                    <button
                      onClick={() => toggleExpand(u)}
                      className="flex-shrink-0 self-start mt-1 p-0.5"
                      title={expanded ? "Collapse" : "Expand"}
                    >
                      {expanded ? (
                        <ChevronUp className="w-4 h-4" style={{ color: "var(--txt-4)" }} />
                      ) : (
                        <ChevronDown className="w-4 h-4" style={{ color: "var(--txt-4)" }} />
                      )}
                    </button>

                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => toggleExpand(u)}
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>
                          {u.display_name || u.email.split("@")[0]}
                        </p>
                        {u.is_admin && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: "var(--acc-bg)", color: "var(--acc)" }}
                          >
                            ADMIN
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: "var(--txt-4)" }}>(you)</span>
                        )}
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: "var(--txt-4)" }}>{u.email}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "var(--txt-4)" }}>
                        <span className="flex items-center gap-1">
                          {u.email_confirmed ? <Mail className="w-3 h-3" /> : <MailX className="w-3 h-3" />}
                          {u.email_confirmed ? "verified" : "unverified"}
                        </span>
                        <span>
                          {u.subscription_count === 0
                            ? "No subscriptions"
                            : `${u.subscription_count} subscription${u.subscription_count !== 1 ? "s" : ""} across ${u.domains.length} domain${u.domains.length !== 1 ? "s" : ""}`}
                        </span>
                        {!u.has_profile && (
                          <span style={{ color: "#F59E0B" }}>no profile row</span>
                        )}
                      </div>

                      {expanded && u.subscription_count > 0 && (
                        <div className="flex items-center flex-wrap gap-1 mt-3" onClick={(e) => e.stopPropagation()}>
                          {u.domains.map((d) => {
                            const c = getDomainColor(d);
                            const count = channelsByDomain[d]?.length ?? 0;
                            return (
                              <span
                                key={d}
                                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                {d} ({count})
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {expanded && (
                        <div
                          className="mt-3 rounded-xl border p-3"
                          style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--txt-4)" }}>
                            Manage subscriptions
                          </p>
                          {catalogLoading === u.id ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--txt-4)" }} />
                            </div>
                          ) : catalogs[u.id] ? (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                              {DOMAIN_ORDER.filter((d) => catalogs[u.id].sources.some((s) => s.domain === d)).map((d) => {
                                const c = getDomainColor(d);
                                const sourcesInDomain = catalogs[u.id].sources.filter((s) => s.domain === d);
                                return (
                                  <div key={d}>
                                    <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${c.text}`}>{d}</p>
                                    <div className="space-y-1">
                                      {sourcesInDomain.map((s) => {
                                        const subscribed = catalogs[u.id].subscribedIds.has(s.id);
                                        const key = `${u.id}:${s.id}`;
                                        const subBusy = subBusyKey === key;
                                        return (
                                          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="truncate" style={{ color: "var(--txt-2)" }}>{s.name}</span>
                                            <button
                                              onClick={() => toggleUserSubscription(u, s, subscribed)}
                                              disabled={subBusy}
                                              className="flex items-center gap-1 flex-shrink-0 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors disabled:opacity-50"
                                              style={subscribed
                                                ? { background: "var(--acc-bg)", borderColor: "var(--acc)", color: "var(--acc)" }
                                                : { background: "transparent", borderColor: "var(--bdr)", color: "var(--txt-3)" }
                                              }
                                            >
                                              {subBusy ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              ) : subscribed ? (
                                                <BellOff className="w-3 h-3" />
                                              ) : (
                                                <Bell className="w-3 h-3" />
                                              )}
                                              {subscribed ? "Subscribed" : "Subscribe"}
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: "var(--txt-4)" }}>No podcasts in catalog.</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 self-start">
                      <button
                        onClick={() => toggleAdmin(u)}
                        disabled={busy || (isSelf && u.is_admin)}
                        title={u.is_admin ? "Revoke admin" : "Grant admin"}
                        className="p-2 rounded-lg border transition-colors disabled:opacity-40"
                        style={{ borderColor: "var(--bdr)", color: "var(--txt-3)" }}
                      >
                        {u.is_admin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleDigestEnabled(u)}
                        disabled={busy}
                        title={u.digest_enabled ? "Disable email digest" : "Enable email digest"}
                        className="p-2 rounded-lg border transition-colors disabled:opacity-40"
                        style={u.digest_enabled
                          ? { background: "var(--acc-bg)", borderColor: "var(--acc)", color: "var(--acc)" }
                          : { borderColor: "var(--bdr)", color: "var(--txt-3)" }
                        }
                      >
                        {u.digest_enabled ? <MailCheck className="w-3.5 h-3.5" /> : <MailMinus className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleWeeklyRecommendations(u)}
                        disabled={busy}
                        title={u.weekly_recommendations_enabled ? "Unsubscribe from Weekly Recommendations" : "Subscribe to Weekly Recommendations"}
                        className="p-2 rounded-lg border transition-colors disabled:opacity-40"
                        style={u.weekly_recommendations_enabled
                          ? { background: "var(--acc-bg)", borderColor: "var(--acc)", color: "var(--acc)" }
                          : { borderColor: "var(--bdr)", color: "var(--txt-3)" }
                        }
                      >
                        {u.weekly_recommendations_enabled ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarX className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => resetOnboarding(u)}
                        disabled={busy}
                        title="Reset onboarding (clears subscriptions)"
                        className="p-2 rounded-lg border transition-colors disabled:opacity-40"
                        style={{ borderColor: "var(--bdr)", color: "var(--txt-3)" }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      {confirmDeleteId === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteUser(u)}
                            disabled={busy}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: "#EF4444" }}
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={busy}
                            className="px-2.5 py-1.5 rounded-lg text-xs"
                            style={{ color: "var(--txt-4)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(u.id)}
                          disabled={busy || isSelf}
                          title={isSelf ? "You cannot delete your own account" : "Delete user"}
                          className="p-2 rounded-lg border transition-colors disabled:opacity-40"
                          style={{ borderColor: "var(--bdr)", color: "#EF4444" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl z-50"
          style={{
            background: toast.type === "error" ? "#EF4444" : "var(--acc)",
            color: "#fff",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

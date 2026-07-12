"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Headphones, MessageCircle, Sparkles, User } from "lucide-react";

interface MobileNavProps {
  newInsightCount?: number;
}

const TABS = [
  { href: "/dashboard",       label: "Dashboard", icon: LayoutDashboard },
  { href: "/podcasts",        label: "Podcasts",  icon: Headphones },
  { href: "/ask",             label: "Ask",       icon: MessageCircle },
  { href: "/recommendations", label: "For You",   icon: Sparkles },
  { href: "/profile",         label: "Profile",   icon: User },
] as const;

export default function MobileNav({ newInsightCount = 0 }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t flex"
      style={{
        background: "var(--bg-nav)",
        borderColor: "var(--nav-bdr)",
        boxShadow: "0 -1px 12px rgba(0,0,0,0.08)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href);
        const showBadge = href === "/dashboard" && newInsightCount > 0;
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors relative"
            style={{ color: active ? "var(--acc)" : "var(--txt-4)" }}
          >
            <div className="relative">
              <Icon
                className="w-5 h-5 flex-shrink-0"
                strokeWidth={active ? 2.25 : 1.75}
              />
              {showBadge && (
                <span
                  className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold px-1 leading-none"
                  style={{ background: "var(--acc)", color: "#fff" }}
                >
                  {newInsightCount > 99 ? "99+" : newInsightCount}
                </span>
              )}
            </div>
            <span
              className="text-[10px] font-medium leading-none"
              style={{ fontWeight: active ? 600 : 400 }}
            >
              {label}
            </span>
            {showBadge && (
              <span
                className="text-[8px] font-semibold leading-none"
                style={{ color: "var(--acc)" }}
              >
                new
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

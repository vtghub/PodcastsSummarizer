"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Headphones, BarChart2, User } from "lucide-react";

const TABS = [
  { href: "/dashboard",  label: "Dashboard", icon: LayoutDashboard },
  { href: "/podcasts",   label: "Podcasts",  icon: Headphones },
  { href: "/analytics",  label: "Analytics", icon: BarChart2 },
  { href: "/profile",    label: "Profile",   icon: User },
] as const;

export default function MobileNav() {
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
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
            style={{ color: active ? "var(--acc)" : "var(--txt-4)" }}
          >
            <Icon
              className="w-5 h-5 flex-shrink-0"
              strokeWidth={active ? 2.25 : 1.75}
            />
            <span
              className="text-[10px] font-medium leading-none"
              style={{ fontWeight: active ? 600 : 400 }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

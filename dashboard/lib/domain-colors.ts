export const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Technology & AI":          { bg: "bg-blue-950",   text: "text-blue-300",   border: "border-blue-800",   dot: "bg-blue-400"   },
  "Business & Startups":      { bg: "bg-emerald-950", text: "text-emerald-300", border: "border-emerald-800", dot: "bg-emerald-400" },
  "Health & Science":         { bg: "bg-pink-950",   text: "text-pink-300",   border: "border-pink-800",   dot: "bg-pink-400"   },
  "Finance & Investing":      { bg: "bg-amber-950",  text: "text-amber-300",  border: "border-amber-800",  dot: "bg-amber-400"  },
  "Leadership & Productivity":{ bg: "bg-violet-950", text: "text-violet-300", border: "border-violet-800", dot: "bg-violet-400" },
  "Society & Culture":        { bg: "bg-rose-950",   text: "text-rose-300",   border: "border-rose-800",   dot: "bg-rose-400"   },
  "Other":                    { bg: "bg-slate-900",  text: "text-slate-300",  border: "border-slate-700",  dot: "bg-slate-400"  },
};

export function getDomainColor(domain: string) {
  return DOMAIN_COLORS[domain] ?? DOMAIN_COLORS["Other"];
}

const DOMAIN_KEY: Record<string, string> = {
  "Technology & AI":           "tech",
  "Business & Startups":       "biz",
  "Health & Science":          "hlth",
  "Finance & Investing":       "fin",
  "Leadership & Productivity": "lead",
  "Society & Culture":         "soc",
  "General":                   "gen",
  "Other":                     "oth",
};

export const DOMAINS = Object.keys(DOMAIN_KEY);

export function getDomainColor(domain: string) {
  const k = DOMAIN_KEY[domain] ?? "oth";
  return {
    bg:     `bg-[var(--d-${k}-bg)]`,
    text:   `text-[var(--d-${k}-txt)]`,
    border: `border-[var(--d-${k}-bdr)]`,
    dot:    `bg-[var(--d-${k}-dot)]`,
  };
}

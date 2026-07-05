"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  selectedDate: string;
  availableDates: string[];
}

export default function DateNav({ selectedDate, availableDates }: Props) {
  const router = useRouter();

  const sortedDates = [...availableDates].sort();
  const currentIdx = sortedDates.indexOf(selectedDate);

  const prevDate = currentIdx > 0 ? sortedDates[currentIdx - 1] : null;
  const nextDate = currentIdx < sortedDates.length - 1 ? sortedDates[currentIdx + 1] : null;

  const navigate = (date: string) => router.push(`/dashboard?date=${date}`);
  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => { if (e.target.value) navigate(e.target.value); };

  // Prefetch adjacent dates so navigation is instant
  useEffect(() => {
    if (prevDate) router.prefetch(`/dashboard?date=${prevDate}`);
    if (nextDate) router.prefetch(`/dashboard?date=${nextDate}`);
  }, [prevDate, nextDate, router]);

  const navBtn = (onClick: () => void, disabled: boolean, title: string, icon: React.ReactNode) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ borderColor: "var(--bdr)", color: "var(--txt-3)" }}
      onMouseEnter={(e) => { if (!disabled) { (e.currentTarget as HTMLElement).style.borderColor = "var(--bdr-hov)"; (e.currentTarget as HTMLElement).style.color = "var(--txt-1)"; } }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--bdr)"; (e.currentTarget as HTMLElement).style.color = "var(--txt-3)"; }}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center gap-2">
      {navBtn(() => prevDate && navigate(prevDate), !prevDate, prevDate ? `Go to ${prevDate}` : "No earlier dates", <ChevronLeft className="w-4 h-4" />)}

      <div className="relative flex items-center">
        <Calendar className="absolute left-3 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--txt-4)" }} />
        {availableDates.length > 0 ? (
          <select
            value={selectedDate}
            onChange={handleSelect}
            className="pl-8 pr-4 py-2 rounded-lg text-sm appearance-none cursor-pointer border outline-none transition-colors"
            style={{
              background: "var(--bg-input)",
              borderColor: "var(--bdr)",
              color: "var(--txt-2)",
            }}
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>{formatDateOption(d)}</option>
            ))}
          </select>
        ) : (
          <span
            className="pl-8 pr-4 py-2 text-sm border rounded-lg"
            style={{ borderColor: "var(--bdr)", color: "var(--txt-4)" }}
          >
            {formatDateOption(selectedDate)}
          </span>
        )}
      </div>

      {navBtn(() => nextDate && navigate(nextDate), !nextDate, nextDate ? `Go to ${nextDate}` : "No later dates", <ChevronRight className="w-4 h-4" />)}
    </div>
  );
}

function formatDateOption(dateStr: string): string {
  try { return format(parseISO(dateStr), "MMM d, yyyy"); }
  catch { return dateStr; }
}

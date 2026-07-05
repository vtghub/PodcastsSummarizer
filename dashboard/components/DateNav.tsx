"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, parseISO, addDays, subDays } from "date-fns";

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

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value) navigate(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Prev */}
      <button
        onClick={() => prevDate && navigate(prevDate)}
        disabled={!prevDate}
        className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={prevDate ? `Go to ${prevDate}` : "No earlier dates"}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Date selector */}
      <div className="relative flex items-center">
        <Calendar className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
        {availableDates.length > 0 ? (
          <select
            value={selectedDate}
            onChange={handleSelect}
            className="pl-8 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-slate-500 transition-colors"
          >
            {availableDates.map((d) => (
              <option key={d} value={d}>
                {formatDateOption(d)}
              </option>
            ))}
          </select>
        ) : (
          <span className="pl-8 pr-4 py-2 text-sm text-slate-500 border border-slate-700 rounded-lg">
            {formatDateOption(selectedDate)}
          </span>
        )}
      </div>

      {/* Next */}
      <button
        onClick={() => nextDate && navigate(nextDate)}
        disabled={!nextDate}
        className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title={nextDate ? `Go to ${nextDate}` : "No later dates"}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function formatDateOption(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths,
} from "date-fns";

interface Props {
  selectedDate: string;
  availableDates: string[];
}

export default function DateNav({ selectedDate, availableDates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    try { return startOfMonth(parseISO(selectedDate)); }
    catch { return startOfMonth(new Date()); }
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  const sortedDates = [...availableDates].sort();
  const currentIdx = sortedDates.indexOf(selectedDate);
  const prevDate = currentIdx > 0 ? sortedDates[currentIdx - 1] : null;
  const nextDate = currentIdx < sortedDates.length - 1 ? sortedDates[currentIdx + 1] : null;

  const availableSet = new Set(availableDates);

  const navigate = (date: string) => {
    setOpen(false);
    router.push(`/dashboard?date=${date}`);
  };

  // Prefetch all available dates for instant navigation
  useEffect(() => {
    availableDates.forEach((d) => router.prefetch(`/dashboard?date=${d}`));
  }, [availableDates, router]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync viewDate when selectedDate changes externally (e.g. prev/next buttons)
  useEffect(() => {
    try { setViewDate(startOfMonth(parseISO(selectedDate))); }
    catch { /* ignore */ }
  }, [selectedDate]);

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

  const formattedSelected = (() => {
    try { return format(parseISO(selectedDate), "MMM d, yyyy"); }
    catch { return selectedDate; }
  })();

  return (
    <div className="flex items-center gap-2">
      {navBtn(() => prevDate && navigate(prevDate), !prevDate, prevDate ? `Go to ${prevDate}` : "No earlier dates", <ChevronLeft className="w-4 h-4" />)}

      {/* Calendar trigger */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-lg text-sm border outline-none transition-colors"
          style={{
            background: "var(--bg-input)",
            borderColor: open ? "var(--acc)" : "var(--bdr)",
            color: "var(--txt-2)",
            boxShadow: open ? "0 0 0 3px var(--acc-ring)" : "none",
          }}
          title="Pick a date"
        >
          <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
          {availableDates.length > 0 ? formattedSelected : <span style={{ color: "var(--txt-4)" }}>{formattedSelected}</span>}
        </button>

        {open && availableDates.length > 0 && (
          <CalendarPopover
            selectedDate={selectedDate}
            availableSet={availableSet}
            viewDate={viewDate}
            onViewChange={setViewDate}
            onSelect={navigate}
          />
        )}
      </div>

      {navBtn(() => nextDate && navigate(nextDate), !nextDate, nextDate ? `Go to ${nextDate}` : "No later dates", <ChevronRight className="w-4 h-4" />)}
    </div>
  );
}

interface CalendarPopoverProps {
  selectedDate: string;
  availableSet: Set<string>;
  viewDate: Date;
  onViewChange: (d: Date) => void;
  onSelect: (date: string) => void;
}

function CalendarPopover({ selectedDate, availableSet, viewDate, onViewChange, onSelect }: CalendarPopoverProps) {
  const start = startOfWeek(startOfMonth(viewDate));
  const end = endOfWeek(endOfMonth(viewDate));
  const days = eachDayOfInterval({ start, end });

  const selectedParsed = (() => { try { return parseISO(selectedDate); } catch { return null; } })();

  return (
    <div
      className="absolute right-0 z-50 mt-1 rounded-xl border p-3 shadow-xl"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--bdr)",
        minWidth: 260,
        boxShadow: "var(--shadow-card-hov, 0 8px 24px rgba(0,0,0,0.12))",
      }}
    >
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onViewChange(subMonths(viewDate, 1))}
          className="p-1 rounded-md transition-colors"
          style={{ color: "var(--txt-3)" }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--txt-1)"}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--txt-3)"}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>
          {format(viewDate, "MMMM yyyy")}
        </span>
        <button
          onClick={() => onViewChange(addMonths(viewDate, 1))}
          className="p-1 rounded-md transition-colors"
          style={{ color: "var(--txt-3)" }}
          onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = "var(--txt-1)"}
          onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = "var(--txt-3)"}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-xs font-medium py-1" style={{ color: "var(--txt-4)" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isAvailable = availableSet.has(dateStr);
          const isSelected = selectedParsed ? isSameDay(day, selectedParsed) : false;
          const isCurrentMonth = isSameMonth(day, viewDate);

          return (
            <button
              key={dateStr}
              disabled={!isAvailable}
              onClick={() => isAvailable && onSelect(dateStr)}
              className="relative flex items-center justify-center rounded-md text-xs h-8 transition-colors"
              style={{
                color: isSelected
                  ? "var(--acc-txt, #fff)"
                  : isAvailable && isCurrentMonth
                  ? "var(--txt-1)"
                  : isAvailable
                  ? "var(--txt-3)"
                  : "var(--txt-4)",
                background: isSelected ? "var(--acc)" : "transparent",
                opacity: isCurrentMonth ? 1 : 0.4,
                cursor: isAvailable ? "pointer" : "default",
                fontWeight: isSelected ? 600 : isAvailable ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (isAvailable && !isSelected) {
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
              title={isAvailable ? `View ${dateStr}` : undefined}
            >
              {isAvailable && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: "var(--acc)" }}
                />
              )}
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

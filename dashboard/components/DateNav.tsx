"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isToday,
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

  // Close on outside click
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

  // Keep viewDate in sync when navigating via arrows
  useEffect(() => {
    try { setViewDate(startOfMonth(parseISO(selectedDate))); }
    catch { /* ignore */ }
  }, [selectedDate]);

  const formattedSelected = (() => {
    try { return format(parseISO(selectedDate), "MMM d, yyyy"); }
    catch { return selectedDate; }
  })();

  return (
    <div className="flex items-center gap-1.5">
      {/* Prev arrow */}
      <NavArrow
        onClick={() => prevDate && navigate(prevDate)}
        disabled={!prevDate}
        title={prevDate ? `Go to ${prevDate}` : "No earlier dates"}
        icon={<ChevronLeft className="w-4 h-4" />}
      />

      {/* Date trigger */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all select-none"
          style={{
            background: open ? "var(--bg-elevated)" : "var(--bg-input)",
            borderColor: open ? "var(--acc)" : "var(--bdr)",
            color: "var(--txt-1)",
            boxShadow: open ? "0 0 0 3px var(--acc-ring)" : "none",
            minWidth: 140,
          }}
        >
          <CalendarDays
            className="w-4 h-4 flex-shrink-0"
            style={{ color: open ? "var(--acc)" : "var(--txt-4)" }}
          />
          <span>{availableDates.length > 0 ? formattedSelected : <span style={{ color: "var(--txt-4)" }}>{formattedSelected}</span>}</span>
          <ChevronLeft
            className="w-3 h-3 ml-auto flex-shrink-0 transition-transform"
            style={{
              color: "var(--txt-4)",
              transform: open ? "rotate(90deg)" : "rotate(-90deg)",
            }}
          />
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

      {/* Next arrow */}
      <NavArrow
        onClick={() => nextDate && navigate(nextDate)}
        disabled={!nextDate}
        title={nextDate ? `Go to ${nextDate}` : "No later dates"}
        icon={<ChevronRight className="w-4 h-4" />}
      />
    </div>
  );
}

function NavArrow({ onClick, disabled, title, icon }: {
  onClick: () => void; disabled: boolean; title: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-lg border transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
      style={{ borderColor: "var(--bdr)", color: "var(--txt-3)", background: "var(--bg-input)" }}
      onMouseEnter={(e) => {
        if (!disabled) {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = "var(--bdr-hov)";
          el.style.color = "var(--txt-1)";
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--bdr)";
        el.style.color = "var(--txt-3)";
      }}
    >
      {icon}
    </button>
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
      className="absolute right-0 z-50 mt-2 rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--bdr)",
        width: 288,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Month navigation header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}
      >
        <button
          onClick={() => onViewChange(subMonths(viewDate, 1))}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--txt-3)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--txt-1)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--txt-3)")}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-sm font-semibold tracking-wide" style={{ color: "var(--txt-1)" }}>
          {format(viewDate, "MMMM yyyy")}
        </span>

        <button
          onClick={() => onViewChange(addMonths(viewDate, 1))}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--txt-3)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--txt-1)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--txt-3)")}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-semibold uppercase tracking-wider py-1.5"
              style={{ color: "var(--txt-4)" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isAvailable = availableSet.has(dateStr);
            const isSelected = selectedParsed ? isSameDay(day, selectedParsed) : false;
            const isCurrentMonth = isSameMonth(day, viewDate);
            const isTodayDate = isToday(day);

            return (
              <div key={dateStr} className="flex items-center justify-center">
                <button
                  disabled={!isAvailable}
                  onClick={() => isAvailable && onSelect(dateStr)}
                  className="relative flex flex-col items-center justify-center rounded-xl transition-all"
                  style={{
                    width: 36,
                    height: 36,
                    cursor: isAvailable ? "pointer" : "default",
                    background: isSelected
                      ? "var(--acc)"
                      : "transparent",
                    color: isSelected
                      ? "#fff"
                      : isAvailable && isCurrentMonth
                      ? "var(--txt-1)"
                      : isAvailable
                      ? "var(--txt-3)"
                      : "var(--txt-4)",
                    opacity: isCurrentMonth ? 1 : 0.35,
                    fontWeight: isSelected ? 700 : isAvailable ? 500 : 400,
                    fontSize: 13,
                    outline: isTodayDate && !isSelected ? "2px solid var(--acc)" : "none",
                    outlineOffset: -2,
                  }}
                  onMouseEnter={(e) => {
                    if (isAvailable && !isSelected) {
                      (e.currentTarget as HTMLElement).style.background = "var(--acc-bg)";
                      (e.currentTarget as HTMLElement).style.color = "var(--acc)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = isAvailable && isCurrentMonth
                        ? "var(--txt-1)"
                        : isAvailable ? "var(--txt-3)" : "var(--txt-4)";
                    }
                  }}
                  title={isAvailable ? `View insights for ${format(day, "MMMM d, yyyy")}` : undefined}
                >
                  <span className="leading-none">{format(day, "d")}</span>
                  {/* Dot for available dates (shown only when not selected) */}
                  {isAvailable && !isSelected && (
                    <span
                      className="absolute rounded-full"
                      style={{
                        width: 4,
                        height: 4,
                        bottom: 4,
                        background: "var(--acc)",
                      }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer legend */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 border-t text-xs"
        style={{ borderColor: "var(--bdr)", color: "var(--txt-4)", background: "var(--bg-elevated)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: "var(--acc)" }} />
          Has insights
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-4 rounded-lg border-2 text-center leading-3 text-xs"
            style={{ borderColor: "var(--acc)", color: "var(--txt-3)" }}
          />
          Today
        </span>
      </div>
    </div>
  );
}

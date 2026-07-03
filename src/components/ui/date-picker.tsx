"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function parseISO(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Stylish, locale-aware date picker (EduLM design language). A popover with
 * month + year dropdowns (year dropdown matters for dates of birth — you jump
 * straight to 2014 instead of clicking ‹ 130 times) and a clickable day grid.
 * Submits the value through a hidden input named `name` as `YYYY-MM-DD`, so the
 * server action reads it exactly like the old native date input.
 */
export function DatePicker({
  name,
  id,
  defaultValue,
  required,
  placeholder,
  fromYear,
  toYear,
}: {
  name: string;
  id?: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder: string;
  /** Earliest selectable year (default: 80 years ago). */
  fromYear?: number;
  /** Latest selectable year (default: current year). */
  toYear?: number;
}) {
  const locale = useLocale();
  const now = new Date();
  const minYear = fromYear ?? now.getFullYear() - 80;
  const maxYear = toYear ?? now.getFullYear();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | null>(() => parseISO(defaultValue));
  const initialView = selected ?? new Date(maxYear - 6, 8, 1); // ~Sept of a plausible birth year
  const [viewYear, setViewYear] = useState(initialView.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialView.getMonth());
  const t = useTranslations("common");

  const intl = useMemo(
    () => ({
      monthLong: new Intl.DateTimeFormat(locale, { month: "long" }),
      weekdayShort: new Intl.DateTimeFormat(locale, { weekday: "short" }),
      full: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    }),
    [locale],
  );

  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => intl.monthLong.format(new Date(2021, m, 1))),
    [intl],
  );
  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxYear; y >= minYear; y--) out.push(y);
    return out;
  }, [minYear, maxYear]);

  // Monday-first weekday headers.
  const weekdays = useMemo(() => {
    const base = new Date(2021, 1, 1); // Mon 1 Feb 2021
    return Array.from({ length: 7 }, (_, i) =>
      intl.weekdayShort.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)),
    );
  }, [intl]);

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const arr: (number | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pick(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    setSelected(d);
    setOpen(false);
  }

  const navBtn =
    "inline-flex size-7 items-center justify-center rounded-md text-[color:var(--muted-fg)] transition-colors duration-150 ease-out hover:bg-[color:var(--muted)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={selected ? toISO(selected) : ""} />
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-required={required}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm outline-none transition-colors duration-150 ease-out",
            "border-[color:var(--border)] hover:border-[color:var(--color-border-strong,var(--border))]",
            "focus-visible:border-[color:var(--primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
            !selected && "text-[color:var(--muted-fg)]",
          )}
        >
          <span className="truncate">
            {selected ? intl.full.format(selected) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 text-[color:var(--muted-fg)]" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-3">
        <div className="space-y-3">
          {/* Header: prev — month/year selects — next */}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={navBtn} onClick={() => shiftMonth(-1)} aria-label={t("previousMonth")}>
              <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-sm capitalize outline-none focus-visible:border-[color:var(--primary)]"
                aria-label={t("month")}
              >
                {monthNames.map((mn, i) => (
                  <option key={i} value={i} className="capitalize">
                    {mn}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-[color:var(--primary)]"
                aria-label={t("year")}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={navBtn} onClick={() => shiftMonth(1)} aria-label={t("nextMonth")}>
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0.5">
            {weekdays.map((w, i) => (
              <div
                key={i}
                className="flex h-7 items-center justify-center text-[0.7rem] font-medium uppercase text-[color:var(--muted-fg)]"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="size-9" />;
              const date = new Date(viewYear, viewMonth, day);
              const isSelected = selected ? sameDay(date, selected) : false;
              const isToday = sameDay(date, now);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-md text-sm transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]",
                    isSelected
                      ? "bg-[color:var(--primary)] font-medium text-white hover:bg-[color:var(--color-brand-600,var(--primary))]"
                      : "text-[color:var(--foreground)] hover:bg-[color:var(--muted)]",
                    !isSelected && isToday && "ring-1 ring-[color:var(--primary)]/40",
                  )}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

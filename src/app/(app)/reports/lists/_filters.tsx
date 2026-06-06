"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Year = { id: string; label: string; isActive: boolean };
type Cls = { id: string; name: string };

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const SELECT_CLS =
  "h-9 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 text-sm text-[color:var(--color-foreground)] transition-colors focus:border-[color:var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand-500)]/30";

/**
 * Filters for a detailed report. Pushes the selection into the URL search
 * params (server re-renders with the new filter). Changing the year clears
 * the class and nationality (their options are year-specific); the month is
 * independent and kept.
 */
export function ReportFilters({
  years,
  classes,
  nationalities,
  showClass,
  showMonth,
  showNationality,
  currentYear,
  currentClass,
  currentMonth,
  currentNationality,
}: {
  years: Year[];
  classes: Cls[];
  nationalities: string[];
  showClass: boolean;
  showMonth: boolean;
  showNationality: boolean;
  currentYear: string;
  currentClass: string;
  currentMonth: string;
  currentNationality: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function update(next: {
    year?: string;
    class?: string;
    month?: string;
    nationality?: string;
  }) {
    const p = new URLSearchParams(sp.toString());
    if (next.year !== undefined) {
      p.set("year", next.year);
      p.delete("class"); // year-specific options
      p.delete("nationality");
    }
    const setOrDel = (key: string, val?: string) => {
      if (val === undefined) return;
      if (val) p.set(key, val);
      else p.delete(key);
    };
    setOrDel("class", next.class);
    setOrDel("month", next.month);
    setOrDel("nationality", next.nationality);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {years.length > 0 ? (
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          Année
          <select
            value={currentYear}
            onChange={(e) => update({ year: e.target.value })}
            className={SELECT_CLS}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.isActive ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showMonth ? (
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          Mois
          <select
            value={currentMonth}
            onChange={(e) => update({ month: e.target.value })}
            className={SELECT_CLS}
          >
            {MONTHS_FR.map((m, i) => (
              <option key={i} value={String(i + 1)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showClass ? (
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          Classe
          <select
            value={currentClass}
            onChange={(e) => update({ class: e.target.value })}
            className={SELECT_CLS}
          >
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showNationality ? (
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-foreground-muted)]">
          Nationalité
          <select
            value={currentNationality}
            onChange={(e) => update({ nationality: e.target.value })}
            className={SELECT_CLS}
          >
            <option value="">Toutes les nationalités</option>
            {nationalities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

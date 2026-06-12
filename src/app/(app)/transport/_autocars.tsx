"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Bus, Sunrise, Sunset, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  YearPicker,
  UrlSelect,
  type YearOption,
} from "@/components/shell/year-picker";
import { cn } from "@/lib/utils";
import type { BusRow } from "./_manager";

/**
 * "Autocars" tab — expandable panel per bus (stacked accordion). Each student
 * row carries the daily attendance buttons (Présent / Absent / Retard /
 * Départ autorisé / Activité après école) — small colored pills that "shine"
 * when selected. One status per student per bus per day (BusAttendance).
 */

const busNum = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 9e8;
};

const STATUSES: Array<{
  id: string;
  label: string;
  title: string;
  on: string; // selected classes (shine)
  off: string; // idle classes
}> = [
  {
    id: "present",
    label: "Présent",
    title: "Présent",
    on: "bg-emerald-500 text-white ring-2 ring-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.55)]",
    off: "border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400",
  },
  {
    id: "absent",
    label: "Absent",
    title: "Absent",
    on: "bg-red-500 text-white ring-2 ring-red-400/60 shadow-[0_0_10px_rgba(239,68,68,0.55)]",
    off: "border border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400",
  },
  {
    id: "retard",
    label: "Retard",
    title: "En retard",
    on: "bg-amber-500 text-white ring-2 ring-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.55)]",
    off: "border border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
  },
  {
    id: "depart_autorise",
    label: "Départ aut.",
    title: "Départ autorisé",
    on: "bg-sky-500 text-white ring-2 ring-sky-400/60 shadow-[0_0_10px_rgba(14,165,233,0.55)]",
    off: "border border-sky-500/40 text-sky-600 hover:bg-sky-500/10 dark:text-sky-400",
  },
  {
    id: "activite",
    label: "Activité",
    title: "Activité après école",
    on: "bg-violet-500 text-white ring-2 ring-violet-400/60 shadow-[0_0_10px_rgba(139,92,246,0.55)]",
    off: "border border-violet-500/40 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400",
  },
];

type Roles = { matin: boolean; soir: boolean; act: boolean };

export function AutocarsView({
  rows,
  years,
  selectedYearId,
  trim,
  yearLabel,
  date,
  attendance,
  onSetAttendance,
}: {
  rows: BusRow[];
  years: YearOption[];
  selectedYearId: string;
  trim: string;
  yearLabel: string;
  date: string; // "YYYY-MM-DD" — today's school day
  attendance: Record<string, string>; // `${studentId}|${bus}` → status
  onSetAttendance: (input: {
    studentId: string;
    bus: string;
    date: string;
    status: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState<Record<string, string>>(attendance);

  const { buses, byId } = useMemo(() => {
    const buses = new Map<string, Map<string, Roles>>();
    const byId = new Map<string, BusRow>();
    const roleOn = (bus: string, r: BusRow): Roles => {
      byId.set(r.id, r);
      const m = buses.get(bus) ?? new Map<string, Roles>();
      const e = m.get(r.id) ?? { matin: false, soir: false, act: false };
      m.set(r.id, e);
      buses.set(bus, m);
      return e;
    };
    for (const r of rows) {
      const matin = r.bus_as === "yes" ? r.bus_car_matin.trim() : "";
      const soir = r.bus_rs === "yes" ? r.bus_car_soir.trim() : "";
      const act = r.bus_act_bus.trim();
      if (matin) roleOn(matin, r).matin = true;
      if (soir) roleOn(soir, r).soir = true;
      if (act) roleOn(act, r).act = true;
    }
    return { buses, byId };
  }, [rows]);

  const ordered = [...buses.keys()].sort(
    (a, b) => busNum(a) - busNum(b) || a.localeCompare(b),
  );

  function toggleOpen(bus: string) {
    setOpen((p) => {
      const n = new Set(p);
      if (n.has(bus)) n.delete(bus);
      else n.add(bus);
      return n;
    });
  }

  function mark(studentId: string, bus: string, status: string) {
    const key = `${studentId}|${bus}`;
    const prev = marks[key] ?? "";
    const next = prev === status ? "" : status; // re-click → clear
    setMarks((m) => ({ ...m, [key]: next }));
    void onSetAttendance({ studentId, bus, date, status: next }).then((res) => {
      if (!res.ok) {
        setMarks((m) => ({ ...m, [key]: prev }));
        toast.error("Échec de l'enregistrement de la présence");
      }
    });
  }

  const fmtDate = (() => {
    const [y, m, d] = date.split("-");
    return `${d}/${m}/${y}`;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          <span className="font-semibold text-[color:var(--color-foreground)]">{ordered.length}</span> autocar(s) ·{" "}
          {yearLabel} · Trimestre {trim.slice(1)} · Présences du{" "}
          <span className="font-medium text-[color:var(--color-foreground)]">{fmtDate}</span>
        </p>
        <div className="flex gap-2">
          <YearPicker years={years} selectedId={selectedYearId} />
          <UrlSelect
            name="trim"
            value={trim}
            options={[
              { value: "T1", label: "Trimestre 1" },
              { value: "T2", label: "Trimestre 2" },
              { value: "T3", label: "Trimestre 3" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-2">
        {ordered.map((bus) => {
          const riders = buses.get(bus)!;
          const ids = [...riders.keys()].sort((a, b) =>
            byId.get(a)!.name.localeCompare(byId.get(b)!.name),
          );
          const nMatin = ids.filter((id) => riders.get(id)!.matin).length;
          const nSoir = ids.filter((id) => riders.get(id)!.soir).length;
          const nAct = ids.filter((id) => riders.get(id)!.act).length;
          const nMarked = ids.filter((id) => (marks[`${id}|${bus}`] ?? "") !== "").length;
          const isOpen = open.has(bus);
          return (
            <section
              key={bus}
              className="overflow-hidden rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card"
            >
              <button
                type="button"
                onClick={() => toggleOpen(bus)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-start transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--color-foreground)]">
                  <ChevronDown
                    className={cn(
                      "size-4 text-[color:var(--color-foreground-subtle)] transition-transform duration-200 ease-out",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                  <Bus className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
                  Bus {bus}
                  <span className="font-normal text-[color:var(--color-foreground-muted)]">
                    · {ids.length} élève(s)
                  </span>
                </span>
                <span className="flex items-center gap-3 text-xs text-[color:var(--color-foreground-muted)]">
                  {nMarked > 0 ? (
                    <span className="rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 font-semibold tabular-nums text-[color:var(--color-brand-700)]">
                      {nMarked}/{ids.length} pointés
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Sunrise className="size-3.5" aria-hidden /> {nMatin}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Sunset className="size-3.5" aria-hidden /> {nSoir}
                  </span>
                  {nAct > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-flex size-3.5 items-center justify-center rounded bg-amber-500/15 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                        A
                      </span>
                      {nAct}
                    </span>
                  ) : null}
                </span>
              </button>

              {isOpen ? (
                <ul className="border-t border-[color:var(--color-border-subtle)]">
                  {ids.map((id) => {
                    const r = byId.get(id)!;
                    const role = riders.get(id)!;
                    const trajet =
                      role.matin && role.soir ? "AR" : role.matin ? "AS" : role.soir ? "RS" : "";
                    const current = marks[`${id}|${bus}`] ?? "";
                    return (
                      <li
                        key={id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--color-border-subtle)] px-4 py-1.5 last:border-0 hover:bg-[color:var(--color-surface-hover)]"
                      >
                        <Link
                          href={`/students/${r.id}`}
                          className="min-w-0 flex-1 basis-48 truncate text-sm text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)] hover:underline"
                          title={`${r.name} — ${r.className || r.level}`}
                        >
                          {r.name}
                        </Link>
                        <span className="w-14 shrink-0 text-xs text-[color:var(--color-foreground-subtle)]">
                          {r.className || r.level}
                        </span>
                        {trajet ? (
                          <span className="inline-flex w-8 shrink-0 items-center justify-center rounded bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-brand-700)]">
                            {trajet}
                          </span>
                        ) : (
                          <span className="w-8 shrink-0" />
                        )}
                        {role.act ? (
                          <span
                            className="inline-flex shrink-0 items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                            title={`${r.bus_act_nom}${r.bus_act_jours ? ` — ${r.bus_act_jours}` : ""}`}
                          >
                            {r.bus_act_jours || "Act."}
                          </span>
                        ) : null}
                        <span className="flex shrink-0 items-center gap-1">
                          {STATUSES.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              title={s.title}
                              onClick={() => mark(id, bus, s.id)}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all duration-150 ease-out active:scale-95",
                                current === s.id ? s.on : s.off,
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
        {ordered.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">
            Aucun bus assigné pour cette période.
          </p>
        ) : null}
      </div>
    </div>
  );
}

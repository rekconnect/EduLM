"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { saveAttendance } from "./_actions";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type RosterStudent = {
  id: string;
  firstName: string;
  lastName: string;
  initialStatus: Status;
  initialLateMinutes: string;
  initialNote: string;
};

type RowState = {
  status: Status;
  lateMinutes: string;
  note: string;
};

const STATUS_BUTTONS: { value: Status; classes: string; labelKey: string }[] = [
  {
    value: "PRESENT",
    classes: "border-emerald-500 bg-emerald-500 text-white",
    labelKey: "statusPresent",
  },
  {
    value: "ABSENT",
    classes: "border-red-500 bg-red-500 text-white",
    labelKey: "statusAbsent",
  },
  {
    value: "LATE",
    classes: "border-amber-500 bg-amber-500 text-white",
    labelKey: "statusLate",
  },
  {
    value: "EXCUSED",
    classes: "border-slate-500 bg-slate-500 text-white",
    labelKey: "statusExcused",
  },
];

export function AttendanceRoster({
  classId,
  date,
  students,
}: {
  classId: string;
  date: string;
  students: RosterStudent[];
}) {
  const t = useTranslations("attendance");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const s of students) {
      init[s.id] = {
        status: s.initialStatus,
        lateMinutes: s.initialLateMinutes,
        note: s.initialNote,
      };
    }
    return init;
  });

  function setRow(id: string, patch: Partial<RowState>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id]!, ...patch } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("classId", classId);
    fd.set("date", date);
    students.forEach((s, i) => {
      const row = state[s.id]!;
      fd.set(`record[${i}][studentId]`, s.id);
      fd.set(`record[${i}][status]`, row.status);
      if (row.status === "LATE") fd.set(`record[${i}][lateMinutes]`, row.lateMinutes ?? "");
      if (row.note.trim() !== "") fd.set(`record[${i}][note]`, row.note);
    });
    startTransition(async () => {
      const result = await saveAttendance(fd);
      if (result.ok) setSavedAt(new Date());
    });
  }

  if (students.length === 0) {
    return <p className="text-sm text-[color:var(--muted-fg)]">{t("emptyRoster")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Table>
        <THead>
          <tr>
            <TH>{t("colStudent")}</TH>
            <TH>{t("colStatus")}</TH>
            <TH>{t("colNote")}</TH>
          </tr>
        </THead>
        <tbody>
          {students.map((s) => {
            const row = state[s.id]!;
            return (
              <TR key={s.id}>
                <TD>
                  <span className="font-medium">
                    {s.lastName} {s.firstName}
                  </span>
                </TD>
                <TD>
                  <div className="flex flex-wrap items-center gap-1">
                    {STATUS_BUTTONS.map((btn) => {
                      const active = row.status === btn.value;
                      return (
                        <button
                          key={btn.value}
                          type="button"
                          onClick={() => setRow(s.id, { status: btn.value })}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                            active
                              ? btn.classes
                              : "border-[color:var(--border)] text-[color:var(--muted-fg)] hover:bg-[color:var(--muted)]"
                          }`}
                        >
                          {t(btn.labelKey)}
                        </button>
                      );
                    })}
                    {row.status === "LATE" ? (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row.lateMinutes}
                        onChange={(e) => setRow(s.id, { lateMinutes: e.target.value })}
                        className="ms-2 w-16 rounded-md border border-[color:var(--border)] bg-transparent px-2 py-1 text-xs"
                        placeholder="min"
                      />
                    ) : null}
                  </div>
                </TD>
                <TD>
                  <Input
                    value={row.note}
                    onChange={(e) => setRow(s.id, { note: e.target.value })}
                    placeholder={t("noteHint")}
                    className="h-8 text-xs"
                  />
                </TD>
              </TR>
            );
          })}
          {students.length === 0 ? <EmptyRow colSpan={3}>{t("emptyRoster")}</EmptyRow> : null}
        </tbody>
      </Table>

      <div className="flex items-center justify-end gap-3">
        {savedAt ? (
          <span className="text-xs text-emerald-600">
            {t("saved")} · {savedAt.toLocaleTimeString()}
          </span>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "…" : t("save")}
        </Button>
      </div>
    </form>
  );
}

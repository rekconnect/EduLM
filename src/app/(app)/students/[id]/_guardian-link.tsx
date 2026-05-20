"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  linkGuardianToStudent,
  unlinkGuardianFromStudent,
} from "@/app/(app)/admin/parents/_actions";

export type ParentOption = { id: string; name: string | null; email: string };
export type GuardianRow = {
  guardianId: string;
  parentUserId: string;
  name: string | null;
  email: string;
  isPrimary: boolean;
};

export function GuardianManager({
  studentId,
  guardians,
  availableParents,
  canEdit,
}: {
  studentId: string;
  guardians: GuardianRow[];
  availableParents: ParentOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tStudents = useTranslations("students");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [primary, setPrimary] = useState(false);

  function onLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("parentUserId", selected);
    if (primary) fd.set("isPrimary", "on");
    startTransition(async () => {
      await linkGuardianToStudent(fd);
      setOpen(false);
      setSelected("");
      setPrimary(false);
    });
  }

  return (
    <div className="space-y-3">
      {guardians.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-fg)]">{tStudents("noGuardians")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {guardians.map((g) => {
            const boundUnlink = unlinkGuardianFromStudent.bind(null, studentId, g.parentUserId);
            return (
              <li
                key={g.guardianId}
                className="flex items-center justify-between border-b border-[color:var(--border)] pb-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/parents/${g.parentUserId}`}
                    className="font-medium hover:underline"
                  >
                    {g.name ?? g.email}
                  </Link>
                  <span className="text-[color:var(--muted-fg)]">{g.email}</span>
                  {g.isPrimary ? (
                    <span className="inline-flex rounded-full bg-[color:var(--primary)]/10 px-2 py-0.5 text-xs text-[color:var(--primary)]">
                      {t("primaryBadge")}
                    </span>
                  ) : null}
                </div>
                {canEdit ? (
                  <form action={boundUnlink}>
                    <Button size="sm" variant="ghost" type="submit">
                      {t("unlinkAction")}
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        open ? (
          <form
            onSubmit={onLink}
            className="space-y-3 rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] p-4"
          >
            <Select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              required
            >
              <option value="" disabled>
                {t("selectParent")}
              </option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ? `${p.name} — ${p.email}` : p.email}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={primary}
                onChange={(e) => setPrimary(e.target.checked)}
              />
              <span>{t("makePrimary")}</span>
            </label>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setSelected("");
                }}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={pending || !selected}>
                {pending ? tCommon("loading") : tCommon("save")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
              + {t("addExistingGuardian")}
            </Button>
            <Link
              href="/admin/parents/new"
              className="text-sm text-[color:var(--primary)] hover:underline"
            >
              {t("createNewParent")}
            </Link>
          </div>
        )
      ) : null}
    </div>
  );
}

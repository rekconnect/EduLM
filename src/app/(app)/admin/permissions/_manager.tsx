"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ADMIN_MODULES,
  ACCESS_LEVELS,
  type AccessLevel,
  type ModuleGrants,
} from "@/lib/permissions-shared";
import { deleteAdminGrant, saveAdminGrant } from "./_actions";

export type GrantRow = {
  id: string;
  email: string;
  modules: ModuleGrants;
  updatedAt: string;
  /** Matching User account, when one exists (linked by e-mail). */
  account: { name: string | null; role: string; status: string } | null;
};

const LEVEL_TONE: Record<AccessLevel, string> = {
  read: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  write:
    "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  full: "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
};

/** The 8-module × level editor grid, shared by "add" and per-row edit. */
function ModulesGrid({
  value,
  onChange,
  disabled,
}: {
  value: ModuleGrants;
  onChange: (next: ModuleGrants) => void;
  disabled: boolean;
}) {
  const t = useTranslations("adminPermissions");
  return (
    <div className="space-y-3">
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg bg-[color:var(--color-surface-sunken)] px-3 py-2 text-xs text-[color:var(--color-foreground-muted)]">
      {ACCESS_LEVELS.map((lvl) => (
        <span key={lvl} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              LEVEL_TONE[lvl],
            )}
          >
            {t(`level_${lvl}`)}
          </span>
          {t(`levelHint_${lvl}`)}
        </span>
      ))}
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {ADMIN_MODULES.map((m) => (
        <div
          key={m}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150 ease-out",
            value[m]
              ? "border-[color:var(--color-brand-500)]/40 bg-[color:var(--color-brand-50)]/40"
              : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)]",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-[color:var(--color-foreground)]">
              {t(`module_${m}`)}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-[color:var(--color-foreground-subtle)]">
              {t(`moduleDesc_${m}`)}
            </p>
          </div>
          {/* Fixed-width wrapper: the shared Select is w-full by design, so
              it must be sized from outside or it crushes the title column. */}
          <div className="w-40 shrink-0">
            <Select
              aria-label={t(`module_${m}`)}
              value={value[m] ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value as AccessLevel | "";
                const next = { ...value };
                if (v === "") delete next[m];
                else next[m] = v;
                onChange(next);
              }}
            >
              <option value="">{t("levelNone")}</option>
              {ACCESS_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {t(`level_${lvl}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}

function errorKey(err: string | undefined): string {
  switch (err) {
    case "bad-email":
      return "errBadEmail";
    case "parent-email":
      return "errParentEmail";
    case "admin-email":
      return "errAdminEmail";
    default:
      return "errGeneric";
  }
}

function AddGrantForm() {
  const t = useTranslations("adminPermissions");
  const [email, setEmail] = useState("");
  const [modules, setModules] = useState<ModuleGrants>({});
  const [pending, start] = useTransition();

  function onSave() {
    start(async () => {
      const r = await saveAdminGrant({ email, modules });
      if (r.error) {
        toast.error(t(errorKey(r.error)));
      } else {
        toast.success(t("savedToast"));
        setEmail("");
        setModules({});
      }
    });
  }

  return (
    <Card>
      <CardHeader title={t("addTitle")} description={t("addHint")} />
      <CardBody className="space-y-4">
        <div className="max-w-md">
          <label
            htmlFor="grant-email"
            className="mb-1 block text-sm font-medium text-[color:var(--color-foreground)]"
          >
            {t("emailLabel")}
          </label>
          <Input
            id="grant-email"
            type="email"
            value={email}
            placeholder={t("emailPlaceholder")}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <ModulesGrid value={modules} onChange={setModules} disabled={pending} />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onSave}
            disabled={pending || !email.trim() || Object.keys(modules).length === 0}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {t("addButton")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function GrantCard({ row }: { row: GrantRow }) {
  const t = useTranslations("adminPermissions");
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<ModuleGrants>(row.modules);
  const [pending, start] = useTransition();

  function onSave() {
    start(async () => {
      const r = await saveAdminGrant({ email: row.email, modules });
      if (r.error) toast.error(t(errorKey(r.error)));
      else toast.success(t("savedToast"));
    });
  }

  function onDelete() {
    if (!window.confirm(t("confirmDelete", { email: row.email }))) return;
    start(async () => {
      const r = await deleteAdminGrant(row.id);
      if (r.error) toast.error(t("errGeneric"));
      else toast.success(t("deletedToast"));
    });
  }

  const granted = ADMIN_MODULES.filter((m) => row.modules[m]);

  return (
    <div className="rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[color:var(--color-foreground)]">
            {row.account?.name || row.email}
          </p>
          <p className="truncate text-xs text-[color:var(--color-foreground-subtle)]">
            {row.email}
            {" · "}
            {row.account
              ? t("accountLinked", { role: row.account.role })
              : t("accountPending")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden flex-wrap justify-end gap-1 sm:flex">
            {granted.map((m) => (
              <span
                key={m}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  LEVEL_TONE[row.modules[m]!],
                )}
                title={t(`level_${row.modules[m]!}`)}
              >
                {t(`module_${m}`)}
              </span>
            ))}
          </div>
          {open ? (
            <ChevronUp className="size-4 text-[color:var(--color-foreground-subtle)]" aria-hidden />
          ) : (
            <ChevronDown className="size-4 text-[color:var(--color-foreground-subtle)]" aria-hidden />
          )}
        </div>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-[color:var(--color-border-subtle)] px-4 py-4">
          <ModulesGrid value={modules} onChange={setModules} disabled={pending} />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={pending}
              className="gap-2 text-[color:var(--color-danger)]"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("deleteButton")}
            </Button>
            <Button type="button" onClick={onSave} disabled={pending} className="gap-2">
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {t("saveButton")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PermissionsManager({ rows }: { rows: GrantRow[] }) {
  const t = useTranslations("adminPermissions");
  return (
    <div className="space-y-6">
      <AddGrantForm />
      <Card>
        <CardHeader title={t("listTitle")} description={t("listHint")} />
        <CardBody className="space-y-3">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ShieldCheck
                className="size-8 text-[color:var(--color-foreground-subtle)]"
                aria-hidden
              />
              <p className="text-sm text-[color:var(--color-foreground-muted)]">
                {t("empty")}
              </p>
            </div>
          ) : (
            rows.map((r) => <GrantCard key={r.id} row={r} />)
          )}
        </CardBody>
      </Card>
    </div>
  );
}

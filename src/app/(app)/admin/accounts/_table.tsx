"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Loader2,
  Search,
  UserCheck,
  UserX,
  Save,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  resetAccountPassword,
  setAccountPassword,
  toggleAccountStatus,
  updateAccount,
} from "./_actions";

export type AccountRow = {
  id: string;
  name: string | null;
  email: string;
  role: "SCHOOL_ADMIN" | "TEACHER" | "STAFF" | "PARENT";
  status: "ACTIVE" | "INVITED" | "DISABLED";
};

const STATUS_TONE: Record<AccountRow["status"], string> = {
  ACTIVE:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  INVITED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DISABLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
};

const ROLES: Array<AccountRow["role"]> = ["PARENT", "STAFF", "TEACHER", "SCHOOL_ADMIN"];
const MANAGED: Array<AccountRow["role"]> = ["TEACHER", "STAFF", "PARENT"];
const STATUSES: Array<AccountRow["status"]> = ["ACTIVE", "INVITED", "DISABLED"];
const PAGE_SIZE = 50;

/** Button filter pill (the shared FilterPill is link-based). */
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)]"
          : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)] hover:bg-[color:var(--color-brand-50)] hover:text-[color:var(--color-brand-700)]",
      )}
    >
      {children}
    </button>
  );
}

/** Inline account editor: email + role + password (manual or generated). */
function AccountEditor({ row }: { row: AccountRow }) {
  const t = useTranslations("accounts");
  const [email, setEmail] = useState(row.email);
  const [role, setRole] = useState<AccountRow["role"]>(row.role);
  const [manualPw, setManualPw] = useState("");
  const [generated, setGenerated] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty = email.trim().toLowerCase() !== row.email || role !== row.role;

  function onSave() {
    startTransition(async () => {
      const res = await updateAccount(row.id, { email: email.trim(), role });
      if (res.error === "email-taken") toast.error(t("emailTaken"));
      else if (res.error === "bad-email") toast.error(t("badEmail"));
      else if (res.error) toast.error(t("actionError"));
      else toast.success(t("saved"));
    });
  }

  function onSetManual() {
    startTransition(async () => {
      const res = await setAccountPassword(row.id, manualPw);
      if (res.error === "password-too-short") toast.error(t("passwordTooShort"));
      else if (res.error) toast.error(t("actionError"));
      else {
        toast.success(t("manualSet"));
        setManualPw("");
      }
    });
  }

  function onGenerate() {
    startTransition(async () => {
      const res = await resetAccountPassword(row.id);
      if (res.newPassword) {
        setGenerated(res.newPassword);
        toast.success(t("resetDone"));
      } else toast.error(t("actionError"));
    });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(generated);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="grid gap-4 rounded-md bg-[color:var(--color-surface-sunken)] p-4 lg:grid-cols-3">
      {/* Identity */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {t("emailLabel")}
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-9"
            type="email"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {t("roleLabel")}
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as AccountRow["role"])}
            className="mt-1 h-9"
          >
            {MANAGED.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </Select>
        </label>
        <Button
          size="sm"
          type="button"
          disabled={pending || !dirty}
          onClick={onSave}
          className="gap-1.5"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
          {t("saveAction")}
        </Button>
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("syncNote")}</p>
      </div>

      {/* Manual password */}
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {t("manualPasswordLabel")}
          <Input
            value={manualPw}
            onChange={(e) => setManualPw(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            className="mt-1 h-9"
            type="text"
            autoComplete="off"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          disabled={pending || manualPw.length < 8}
          onClick={onSetManual}
          className="gap-1.5"
        >
          <KeyRound className="size-3.5" aria-hidden />
          {t("setPasswordAction")}
        </Button>
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("manualHint")}</p>
      </div>

      {/* Generated temp password */}
      <div className="space-y-3">
        <span className="block text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {t("tempPasswordLabel")}
        </span>
        {generated ? (
          <div className="flex items-center gap-2">
            <code className="rounded bg-[color:var(--color-brand-50)] px-2.5 py-1 text-sm font-semibold tracking-wide text-[color:var(--color-brand-700)]">
              {generated}
            </code>
            <Button size="sm" variant="ghost" type="button" onClick={copyPassword} className="gap-1">
              <Copy className="size-3.5" aria-hidden /> {t("copy")}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={pending}
            onClick={onGenerate}
            className="gap-1.5"
          >
            <Wand2 className="size-3.5" aria-hidden />
            {t("generateAction")}
          </Button>
        )}
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("resetHint")}</p>
      </div>
    </div>
  );
}

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const t = useTranslations("accounts");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<AccountRow["role"] | "">("");
  const [status, setStatus] = useState<AccountRow["status"] | "">("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (role && r.role !== role) return false;
      if (status && r.status !== status) return false;
      if (!needle) return true;
      return (
        (r.name ?? "").toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, role, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.role] = (c[r.role] ?? 0) + 1;
    return c;
  }, [rows]);

  function onToggle(row: AccountRow) {
    setPendingId(row.id);
    startTransition(async () => {
      const res = await toggleAccountStatus(row.id);
      setPendingId(null);
      if (res.error) toast.error(t("actionError"));
      else toast.success(row.status === "DISABLED" ? t("activated") : t("deactivated"));
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
            className="ps-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill active={role === ""} onClick={() => { setRole(""); setPage(1); }}>
            {t("allRoles")} ({rows.length})
          </Pill>
          {ROLES.map((r) => (
            <Pill key={r} active={role === r} onClick={() => { setRole(r); setPage(1); }}>
              {t(`role_${r}`)} ({counts[r] ?? 0})
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <Pill
              key={s}
              active={status === s}
              onClick={() => { setStatus(status === s ? "" : s); setPage(1); }}
            >
              {t(`status_${s}`)}
            </Pill>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <THead>
          <TR>
            <TH>{t("colName")}</TH>
            <TH>{t("colEmail")}</TH>
            <TH>{t("colRole")}</TH>
            <TH>{t("colStatus")}</TH>
            <TH className="text-end">{t("colActions")}</TH>
          </TR>
        </THead>
        <tbody>
          {shown.map((r) => {
            const pending = pendingId === r.id;
            const managed = r.role !== "SCHOOL_ADMIN";
            const expanded = expandedId === r.id;
            return (
              <Fragment key={r.id}>
                <TR className={expanded ? "bg-[color:var(--color-brand-50)]" : ""}>
                  <TD>
                    <span className="font-medium">{r.name ?? r.email}</span>
                  </TD>
                  <TD className="text-[color:var(--color-foreground-muted)]">{r.email}</TD>
                  <TD>
                    <span className="inline-flex rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-brand-700)]">
                      {t(`role_${r.role}`)}
                    </span>
                  </TD>
                  <TD>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[r.status])}>
                      {t(`status_${r.status}`)}
                    </span>
                  </TD>
                  <TD className="text-end">
                    {!managed ? (
                      <span className="text-xs text-[color:var(--color-foreground-subtle)]">{t("adminRow")}</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={pending}
                          onClick={() => onToggle(r)}
                          className="w-28 justify-center gap-1"
                        >
                          {pending ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : r.status === "DISABLED" ? (
                            <UserCheck className="size-3.5" aria-hidden />
                          ) : (
                            <UserX className="size-3.5" aria-hidden />
                          )}
                          {r.status === "DISABLED" ? t("activateAction") : t("deactivateAction")}
                        </Button>
                        <Button
                          size="sm"
                          variant={expanded ? "secondary" : "ghost"}
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="w-24 justify-center gap-1"
                        >
                          {expanded ? (
                            <ChevronUp className="size-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="size-3.5" aria-hidden />
                          )}
                          {t("manageAction")}
                        </Button>
                      </span>
                    )}
                  </TD>
                </TR>
                {expanded && managed ? (
                  <tr className="border-t border-[color:var(--color-border-subtle)]">
                    <td colSpan={5} className="px-4 py-3">
                      <AccountEditor row={r} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          {shown.length === 0 ? (
            <TR>
              <td colSpan={5} className="px-3 py-8 text-center text-sm text-[color:var(--color-foreground-subtle)]">
                {t("empty")}
              </td>
            </TR>
          ) : null}
        </tbody>
      </Table>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-foreground-subtle)]">
            {t("pageInfo", { shown: shown.length, total: filtered.length })}
          </span>
          <span className="inline-flex gap-1.5">
            <Button size="sm" variant="ghost" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ‹
            </Button>
            <span className="px-2 py-1 tabular-nums">{page}/{pageCount}</span>
            <Button size="sm" variant="ghost" type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              ›
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

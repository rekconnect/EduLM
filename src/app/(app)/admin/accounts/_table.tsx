"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Copy, KeyRound, Loader2, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { resetAccountPassword, toggleAccountStatus } from "./_actions";

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

const ROLE_TONE: Record<AccountRow["role"], string> = {
  SCHOOL_ADMIN: "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  TEACHER: "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  STAFF: "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  PARENT: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
};

const ROLES: Array<AccountRow["role"]> = ["PARENT", "STAFF", "TEACHER", "SCHOOL_ADMIN"];
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

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const t = useTranslations("accounts");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<AccountRow["role"] | "">("");
  const [status, setStatus] = useState<AccountRow["status"] | "">("");
  const [page, setPage] = useState(1);
  // userId → generated temp password (shown once, per session)
  const [generated, setGenerated] = useState<Record<string, string>>({});
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

  function onReset(row: AccountRow) {
    setPendingId(row.id);
    startTransition(async () => {
      const res = await resetAccountPassword(row.id);
      setPendingId(null);
      if (res.newPassword) {
        setGenerated((g) => ({ ...g, [row.id]: res.newPassword! }));
        toast.success(t("resetDone"));
      } else {
        toast.error(t("actionError"));
      }
    });
  }

  async function copyPassword(pw: string) {
    try {
      await navigator.clipboard.writeText(pw);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
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
            const pw = generated[r.id];
            const managed = r.role !== "SCHOOL_ADMIN";
            return (
              <TR key={r.id}>
                <TD>
                  {r.role === "PARENT" ? (
                    <Link href={`/admin/parents/${r.id}`} className="font-medium hover:underline">
                      {r.name ?? r.email}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name ?? r.email}</span>
                  )}
                </TD>
                <TD className="text-[color:var(--color-foreground-muted)]">{r.email}</TD>
                <TD>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", ROLE_TONE[r.role])}>
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
                  ) : pw ? (
                    <span className="inline-flex items-center gap-2">
                      <code className="rounded bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-700)]">
                        {pw}
                      </code>
                      <Button size="sm" variant="ghost" type="button" onClick={() => copyPassword(pw)} className="gap-1">
                        <Copy className="size-3.5" aria-hidden /> {t("copy")}
                      </Button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={pending}
                        onClick={() => onReset(r)}
                        className="gap-1"
                      >
                        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <KeyRound className="size-3.5" aria-hidden />}
                        {t("resetAction")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        disabled={pending}
                        onClick={() => onToggle(r)}
                        className="gap-1"
                      >
                        {r.status === "DISABLED" ? (
                          <UserCheck className="size-3.5" aria-hidden />
                        ) : (
                          <UserX className="size-3.5" aria-hidden />
                        )}
                        {r.status === "DISABLED" ? t("activateAction") : t("deactivateAction")}
                      </Button>
                    </span>
                  )}
                </TD>
              </TR>
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

      <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("resetHint")}</p>
    </div>
  );
}

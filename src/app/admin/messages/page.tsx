import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { FilterPill } from "@/components/ui/filter-pill";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

const BASE = "/admin/messages";

const STATUS_KEY: Record<string, string> = {
  NEW: "statusNew",
  READ: "statusRead",
  CLOSED: "statusClosed",
};

const STATUS_TONE: Record<string, string> = {
  NEW: "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
  READ:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  CLOSED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-subtle)]",
};

const STATUSES = ["NEW", "READ", "CLOSED"] as const;

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");

    const statusFilter = (STATUSES as readonly string[]).includes(status ?? "")
      ? (status as (typeof STATUSES)[number])
      : undefined;

    const messages = await db.contactMessage.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("messagesTitle")}
            description={t("messagesAdminLead")}
          />

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={BASE}
              label={t("messagesFilterAll")}
              active={!statusFilter}
            />
            {STATUSES.map((s) => (
              <FilterPill
                key={s}
                href={`${BASE}?status=${s}`}
                label={t(STATUS_KEY[s] ?? "statusNew")}
                active={statusFilter === s}
                tone={STATUS_TONE[s]}
              />
            ))}
          </div>

          {messages.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Inbox className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("messagesEmpty")}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("colFrom")}</TH>
                  <TH>{t("colSubject")}</TH>
                  <TH>{t("colReceived")}</TH>
                  <TH>{t("colStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {messages.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      {m.fromUser.name ?? m.fromUser.email}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/messages/${m.id}`}
                        className={cn(
                          "text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline",
                          m.status === "NEW" ? "font-semibold" : "font-medium",
                        )}
                      >
                        {m.subject}
                      </Link>
                    </TD>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {m.createdAt.toISOString().slice(0, 10)}
                    </TD>
                    <TD>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_TONE[m.status],
                        )}
                      >
                        {t(STATUS_KEY[m.status] ?? "statusNew")}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </main>
      </AppShell>
    );
  });
}

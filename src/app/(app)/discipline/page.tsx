import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { FilterPill } from "@/components/ui/filter-pill";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const BASE = "/discipline";

const SEVERITY_LABEL: Record<string, string> = {
  NOTE: "severityNote",
  WARNING: "severityWarning",
  DETENTION: "severityDetention",
  SUSPENSION: "severitySuspension",
};

const SEVERITY_TONE: Record<string, string> = {
  NOTE: "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
  WARNING:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DETENTION:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  SUSPENSION:
    "bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger-soft-fg)]",
};

const SEVERITIES = ["NOTE", "WARNING", "DETENTION", "SUSPENSION"] as const;

export default async function DisciplinePage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const { severity } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("discipline");

    const severityFilter = (SEVERITIES as readonly string[]).includes(
      severity ?? "",
    )
      ? (severity as (typeof SEVERITIES)[number])
      : undefined;

    const events = await db.disciplineEvent.findMany({
      where: severityFilter ? { severity: severityFilter } : undefined,
      orderBy: { date: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        reportedBy: { select: { name: true, email: true } },
      },
    });

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              <LinkButton href="/discipline/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("createCta")}
              </LinkButton>
            }
          />

          {/* Severity filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={BASE}
              label={t("filterAll")}
              active={!severityFilter}
            />
            {SEVERITIES.map((s) => (
              <FilterPill
                key={s}
                href={`${BASE}?severity=${s}`}
                label={t(SEVERITY_LABEL[s] ?? "severityNote")}
                active={severityFilter === s}
                tone={SEVERITY_TONE[s]}
              />
            ))}
          </div>

          {events.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <AlertTriangle className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {t("empty")}
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("colDate")}</TH>
                  <TH>{t("colStudent")}</TH>
                  <TH>{t("colType")}</TH>
                  <TH>{t("colSeverity")}</TH>
                  <TH>{t("colReporter")}</TH>
                </tr>
              </THead>
              <tbody>
                {events.map((e) => (
                  <TR key={e.id}>
                    <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                      {e.date.toISOString().slice(0, 10)}
                    </TD>
                    <TD>
                      <Link
                        href={`/students/${e.student.id}`}
                        className="font-medium text-[color:var(--color-foreground)] transition-colors hover:text-[color:var(--color-brand-600)] hover:underline"
                      >
                        {e.student.lastName} {e.student.firstName}
                      </Link>
                    </TD>
                    <TD className="text-[color:var(--color-foreground)]">{e.type}</TD>
                    <TD>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          SEVERITY_TONE[e.severity],
                        )}
                      >
                        {t(SEVERITY_LABEL[e.severity] ?? "severityNote")}
                      </span>
                    </TD>
                    <TD className="text-[color:var(--color-foreground-muted)]">
                      {e.reportedBy.name ?? e.reportedBy.email}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </main>
    );
  });
}

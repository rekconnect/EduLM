import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { ArrowRight, RefreshCw, Sparkles, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { SortableTH, type SortDir } from "@/components/ui/sortable-th";
import { FilterPill } from "@/components/ui/filter-pill";
import { UrlSelect } from "@/components/shell/year-picker";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { AppStatusBadge } from "@/app/(app)/parent/applications/_status-badge";

const BASE = "/admissions-admin";

const STATUS_KEY: Record<string, string> = {
  DRAFT: "statusDraft",
  SUBMITTED: "statusSubmitted",
  UNDER_REVIEW: "statusUnderReview",
  INTERVIEW_SCHEDULED: "statusInterview",
  ACCEPTED: "statusAccepted",
  WAITLISTED: "statusWaitlisted",
  DECLINED: "statusDeclined",
  WITHDRAWN: "statusWithdrawn",
};

const ALL_STATUSES: ApplicationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_SCHEDULED",
  "ACCEPTED",
  "WAITLISTED",
  "DECLINED",
  "WITHDRAWN",
];

const SORTABLE_COLUMNS = ["child", "cycle", "submitted", "status"] as const;
type SortKey = (typeof SORTABLE_COLUMNS)[number];

function orderByFor(
  sort: SortKey,
  dir: SortDir,
): Prisma.ApplicationOrderByWithRelationInput[] {
  switch (sort) {
    case "cycle":
      return [{ cycle: { openAt: dir } }];
    case "submitted":
      return [{ submittedAt: { sort: dir, nulls: "last" } }, { createdAt: dir }];
    case "status":
      return [{ status: dir }, { submittedAt: "desc" }];
    case "child":
    default:
      return [{ childLastName: dir }, { childFirstName: dir }];
  }
}

type AdminApp = {
  id: string;
  status: ApplicationStatus;
  childFirstName: string;
  childLastName: string;
  requestedLevel: string | null;
  submittedAt: Date | null;
  isRenewal: boolean;
  cycle: { id: string; label: string };
  submittedBy: { id: string; email: string; name: string | null };
  existingChildren: number;
};

export default async function AdmissionsAdminListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    cycleId?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { status, cycleId, sort, dir } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");

    const statusFilter: ApplicationStatus | undefined = (
      ALL_STATUSES as string[]
    ).includes(status ?? "")
      ? (status as ApplicationStatus)
      : undefined;
    const cycleFilter = cycleId || undefined;

    const sortKey: SortKey = (SORTABLE_COLUMNS as readonly string[]).includes(
      sort ?? "",
    )
      ? (sort as SortKey)
      : "submitted";
    const sortDir: SortDir = dir === "asc" ? "asc" : "desc";

    const where: { status?: ApplicationStatus; cycleId?: string } = {};
    if (statusFilter) where.status = statusFilter;
    if (cycleFilter) where.cycleId = cycleFilter;

    const [apps, cycles] = await Promise.all([
      db.application.findMany({
        where,
        orderBy: orderByFor(sortKey, sortDir),
        include: {
          cycle: { select: { id: true, label: true } },
          submittedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              guardianProfile: {
                select: { childLinks: { select: { studentId: true } } },
              },
            },
          },
        },
      }),
      db.admissionCycle.findMany({
        orderBy: { openAt: "desc" },
        select: { id: true, label: true },
      }),
    ]);

    const newFamilyApps: AdminApp[] = [];
    const existingFamilyApps: AdminApp[] = [];

    for (const a of apps) {
      const childCount = a.submittedBy.guardianProfile?.childLinks.length ?? 0;
      const row: AdminApp = {
        id: a.id,
        status: a.status,
        childFirstName: a.childFirstName,
        childLastName: a.childLastName,
        requestedLevel: a.requestedLevel,
        submittedAt: a.submittedAt,
        isRenewal: !!a.existingStudentId,
        cycle: a.cycle,
        submittedBy: {
          id: a.submittedBy.id,
          email: a.submittedBy.email,
          name: a.submittedBy.name,
        },
        existingChildren: childCount,
      };
      if (childCount > 0) existingFamilyApps.push(row);
      else newFamilyApps.push(row);
    }

    const preserve = {
      status: statusFilter,
      cycleId: cycleFilter,
      sort: sortKey,
      dir: sortDir,
    };
    const filterPreserve = {
      cycleId: preserve.cycleId,
      sort: preserve.sort,
      dir: preserve.dir,
    };

    return (
        <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("adminTitle")}
            description={t("adminLead")}
            action={
              <LinkButton href="/admissions-admin/cycles" size="sm" variant="secondary">
                {t("adminCycles")}
              </LinkButton>
            }
          />

          {/* Cycle filter — auto-submits on change via UrlSelect */}
          <div className="max-w-xs">
            <Field label={t("colCycle")} htmlFor="cycleId">
              <UrlSelect
                name="cycleId"
                value={cycleFilter ?? ""}
                options={[
                  { value: "", label: t("adminAllCycles") },
                  ...cycles.map((c) => ({ value: c.id, label: c.label })),
                ]}
              />
            </Field>
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={hrefWith(BASE, { ...filterPreserve, status: undefined })}
              label={t("adminAllStatuses")}
              active={!statusFilter}
            />
            {ALL_STATUSES.map((s) => (
              <FilterPill
                key={s}
                href={hrefWith(BASE, { ...filterPreserve, status: s })}
                label={t(STATUS_KEY[s] ?? "statusDraft")}
                active={statusFilter === s}
              />
            ))}
          </div>

          <ApplicationGroup
            title={t("groupNewFamily")}
            description={t("groupNewFamilyHint")}
            icon={Sparkles}
            iconTone="bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]"
            apps={newFamilyApps}
            emptyLabel={t("groupEmpty")}
            t={t}
            sortKey={sortKey}
            sortDir={sortDir}
            preserve={preserve}
          />

          <ApplicationGroup
            title={t("groupExistingFamily")}
            description={t("groupExistingFamilyHint")}
            icon={Users}
            iconTone="bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
            apps={existingFamilyApps}
            emptyLabel={t("groupEmpty")}
            t={t}
            sortKey={sortKey}
            sortDir={sortDir}
            preserve={preserve}
            showChildCount
          />
        </main>
    );
  });
}

function ApplicationGroup({
  title,
  description,
  icon: Icon,
  iconTone,
  apps,
  emptyLabel,
  t,
  showChildCount,
  sortKey,
  sortDir,
  preserve,
}: {
  title: string;
  description: string;
  icon: typeof Sparkles;
  iconTone: string;
  apps: AdminApp[];
  emptyLabel: string;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
  showChildCount?: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  preserve: Record<string, string | undefined>;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${iconTone}`}>
          <Icon className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[color:var(--color-foreground)]">
            {title}
            <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium tabular-nums text-[color:var(--color-foreground-muted)]">
              {apps.length}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
            {description}
          </p>
        </div>
      </div>
      <Table>
        <THead>
          <tr>
            <SortableTH
              label={t("colChild")}
              column="child"
              currentSort={sortKey}
              currentDir={sortDir}
              baseUrl={BASE}
              preserve={preserve}
            />
            <SortableTH
              label={t("colCycle")}
              column="cycle"
              currentSort={sortKey}
              currentDir={sortDir}
              baseUrl={BASE}
              preserve={preserve}
            />
            <TH>{t("colRequestedLevel")}</TH>
            <TH>{t("colSubmittedBy")}</TH>
            <SortableTH
              label={t("colSubmitted")}
              column="submitted"
              currentSort={sortKey}
              currentDir={sortDir}
              baseUrl={BASE}
              preserve={preserve}
            />
            <SortableTH
              label={t("colStatus")}
              column="status"
              currentSort={sortKey}
              currentDir={sortDir}
              baseUrl={BASE}
              preserve={preserve}
            />
            <TH className="text-end" />
          </tr>
        </THead>
        <tbody>
          {apps.length === 0 ? (
            <EmptyRow colSpan={7}>{emptyLabel}</EmptyRow>
          ) : (
            apps.map((a) => (
              <TR key={a.id}>
                <TD>
                  <Link
                    href={`/admissions-admin/${a.id}`}
                    className="group flex items-center gap-2"
                  >
                    <span className="font-medium text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                      {a.childLastName} {a.childFirstName}
                    </span>
                    {a.isRenewal ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-brand-700)]">
                        <RefreshCw className="size-2.5" aria-hidden />
                        {t("renewalBadge")}
                      </span>
                    ) : null}
                  </Link>
                </TD>
                <TD className="text-xs text-[color:var(--color-foreground-muted)]">
                  {a.cycle.label}
                </TD>
                <TD className="text-[color:var(--color-foreground)]">
                  {a.requestedLevel ?? "—"}
                </TD>
                <TD className="text-[color:var(--color-foreground-muted)]">
                  <div className="text-[color:var(--color-foreground)]">
                    {a.submittedBy.name ?? a.submittedBy.email}
                  </div>
                  {showChildCount ? (
                    <div className="mt-0.5 text-xs">
                      {t("existingChildrenCount", { n: a.existingChildren })}
                    </div>
                  ) : null}
                </TD>
                <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                  {a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "—"}
                </TD>
                <TD>
                  <AppStatusBadge
                    status={a.status}
                    label={t(STATUS_KEY[a.status] ?? "statusDraft")}
                  />
                </TD>
                <TD className="text-end">
                  <Link
                    href={`/admissions-admin/${a.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                  >
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function hrefWith(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApplicationStatus } from "@prisma/client";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

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

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  INTERVIEW_SCHEDULED: "bg-purple-100 text-purple-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  DECLINED: "bg-red-100 text-red-800",
  WITHDRAWN: "bg-zinc-200 text-zinc-700",
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
  searchParams: Promise<{ status?: string; cycleId?: string }>;
}) {
  const { status, cycleId } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");
    const tCommon = await getTranslations("common");

    const where: { status?: ApplicationStatus; cycleId?: string } = {};
    if (status && (ALL_STATUSES as string[]).includes(status)) {
      where.status = status as ApplicationStatus;
    }
    if (cycleId) where.cycleId = cycleId;

    const [apps, cycles] = await Promise.all([
      db.application.findMany({
        where,
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
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

    // Classify by family status: a new family = submitter has no guardian row
    // yet, OR has a guardian with zero linked students. Existing = at least 1.
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

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
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

          <Card>
            <CardBody>
              <form method="get" className="grid gap-3 sm:grid-cols-2">
                <Field label={t("colCycle")} htmlFor="cycleId">
                  <Select id="cycleId" name="cycleId" defaultValue={cycleId ?? ""}>
                    <option value="">{t("adminAllCycles")}</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={tCommon("save")} htmlFor="status">
                  <Select id="status" name="status" defaultValue={status ?? ""}>
                    <option value="">{t("adminAllStatuses")}</option>
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(STATUS_KEY[s] ?? "statusDraft")}
                      </option>
                    ))}
                  </Select>
                </Field>
              </form>
            </CardBody>
          </Card>

          <ApplicationGroup
            title={`${t("groupNewFamily")} (${newFamilyApps.length})`}
            description={t("groupNewFamilyHint")}
            tone="bg-blue-50 dark:bg-blue-950/30"
            apps={newFamilyApps}
            emptyLabel={t("groupEmpty")}
            t={t}
          />

          <ApplicationGroup
            title={`${t("groupExistingFamily")} (${existingFamilyApps.length})`}
            description={t("groupExistingFamilyHint")}
            tone="bg-emerald-50 dark:bg-emerald-950/30"
            apps={existingFamilyApps}
            emptyLabel={t("groupEmpty")}
            t={t}
            showChildCount
          />
        </main>
      </div>
    );
  });
}

function ApplicationGroup({
  title,
  description,
  tone,
  apps,
  emptyLabel,
  t,
  showChildCount,
}: {
  title: string;
  description: string;
  tone: string;
  apps: AdminApp[];
  emptyLabel: string;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
  showChildCount?: boolean;
}) {
  return (
    <Card>
      <div className={`border-b border-[color:var(--border)] px-6 py-4 ${tone}`}>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted-fg)]">{description}</p>
      </div>
      <Table>
        <THead>
          <tr>
            <TH>{t("colChild")}</TH>
            <TH>{t("colCycle")}</TH>
            <TH>{t("colRequestedLevel")}</TH>
            <TH>{t("colSubmittedBy")}</TH>
            <TH>{t("colSubmitted")}</TH>
            <TH>{t("statusDraft")}</TH>
          </tr>
        </THead>
        <tbody>
          {apps.length === 0 ? (
            <EmptyRow colSpan={6}>{emptyLabel}</EmptyRow>
          ) : (
            apps.map((a) => (
              <TR key={a.id}>
                <TD>
                  <Link
                    href={`/admissions-admin/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.childLastName} {a.childFirstName}
                  </Link>
                  {a.isRenewal ? (
                    <span className="ms-2 inline-flex rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">
                      {t("renewalBadge")}
                    </span>
                  ) : null}
                </TD>
                <TD className="text-xs text-[color:var(--muted-fg)]">{a.cycle.label}</TD>
                <TD>{a.requestedLevel ?? "—"}</TD>
                <TD className="text-[color:var(--muted-fg)]">
                  <div>{a.submittedBy.name ?? a.submittedBy.email}</div>
                  {showChildCount ? (
                    <div className="mt-0.5 text-xs">
                      {t("existingChildrenCount", { n: a.existingChildren })}
                    </div>
                  ) : null}
                </TD>
                <TD className="text-[color:var(--muted-fg)] tabular-nums">
                  {a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "—"}
                </TD>
                <TD>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_TONE[a.status]
                    }`}
                  >
                    {t(STATUS_KEY[a.status] ?? "statusDraft")}
                  </span>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

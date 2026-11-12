import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApplicationStatus, Prisma } from "@prisma/client";
import { ArrowRight, RefreshCw, Sparkles, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { SortableTH, type SortDir } from "@/components/ui/sortable-th";
import { FilterPill } from "@/components/ui/filter-pill";
import { UnverifiedEmailBadge } from "@/components/ui/unverified-email-badge";
import { UrlSelect } from "@/components/shell/year-picker";
import { db } from "@/lib/db";
import { displayName } from "@/lib/names";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { AppStatusBadge } from "@/app/(app)/parent/applications/_status-badge";
import {
  PENDING_WITHOUT_DOSSIER_WHERE,
  UNVERIFIED_PENDING_PARENT_WHERE,
} from "@/app/(app)/admin/parents/_pending";
import {
  BulkHeaderCheckbox,
  BulkRowCheckbox,
  BulkSelectionProvider,
} from "@/components/bulk-selection";
import { AdmissionRowActions } from "./_row-actions";
import { AdmissionsBulkToolbar } from "./_bulk-toolbar";

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
  archived: boolean;
  deleted: boolean;
  cycle: { id: string; label: string };
  submittedBy: {
    id: string;
    email: string;
    name: string | null;
    /** Self-registered account whose address nobody confirmed yet. */
    emailUnverified: boolean;
  };
  existingChildren: number;
};

/** A pending parent account whose family has no dossier yet. */
type NoDossierAccount = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  emailVerified: Date | null;
  createdAt: Date;
  /** Dossiers this account submitted — all in the trash, by definition. */
  _count: { submittedApps: number };
};

// "Comptes sans dossier" block: the most recent accounts by default, the
// whole list (up to a hard cap) behind `?accounts=all`.
const NO_DOSSIER_PREVIEW = 5;
const NO_DOSSIER_MAX = 200;

const VIEWS = ["active", "archived", "deleted"] as const;
type View = (typeof VIEWS)[number];

function parseView(raw: string | undefined): View {
  return (VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as View)
    : "active";
}

// Dossier kind — réinscription, fratrie (new child of a family already at
// school: the submitting parent has linked students) or brand-new family.
const APP_TYPES = ["renewal", "fratrie", "newFamily"] as const;
type AppType = (typeof APP_TYPES)[number];

function appTypeOf(a: { isRenewal: boolean; existingChildren: number }): AppType {
  if (a.isRenewal) return "renewal";
  return a.existingChildren > 0 ? "fratrie" : "newFamily";
}

export default async function AdmissionsAdminListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    cycleId?: string;
    sort?: string;
    dir?: string;
    view?: string;
    type?: string;
    accounts?: string;
  }>;
}) {
  const { status, cycleId, sort, dir, view, type, accounts } =
    await searchParams;
  const currentView: View = parseView(view);
  const { user, access } = await requireModuleAccess("admissions", "read");
  const tenantId = user.tenantId;
  if (!tenantId) return null;
  // The parent fiche and the pending-accounts console live in the Élèves /
  // parents module: only link to them for someone who can open them.
  const canOpenParents = hasModule(access, "eleves", "read");

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("admissions");
    const tPar = await getTranslations("parents");

    const statusFilter: ApplicationStatus | undefined = (
      ALL_STATUSES as string[]
    ).includes(status ?? "")
      ? (status as ApplicationStatus)
      : undefined;
    const cycleFilter = cycleId || undefined;
    const typeFilter: AppType | undefined = (
      APP_TYPES as readonly string[]
    ).includes(type ?? "")
      ? (type as AppType)
      : undefined;

    const sortKey: SortKey = (SORTABLE_COLUMNS as readonly string[]).includes(
      sort ?? "",
    )
      ? (sort as SortKey)
      : "submitted";
    const sortDir: SortDir = dir === "asc" ? "asc" : "desc";

    const where: {
      status?: ApplicationStatus;
      cycleId?: string;
      archived?: boolean;
      deletedAt?: null | { not: null };
    } = {};
    if (statusFilter) where.status = statusFilter;
    if (cycleFilter) where.cycleId = cycleFilter;
    // Three mutually-exclusive views — each shows exactly one bucket.
    if (currentView === "active") {
      where.archived = false;
      where.deletedAt = null;
    } else if (currentView === "archived") {
      where.archived = true;
      where.deletedAt = null;
    } else {
      where.deletedAt = { not: null };
    }

    // Shared filters that apply to every view-count (cycle + status).
    const countBase: { status?: ApplicationStatus; cycleId?: string } = {};
    if (statusFilter) countBase.status = statusFilter;
    if (cycleFilter) countBase.cycleId = cycleFilter;

    // "Comptes sans dossier": families that have an account (public sign-up,
    // or created by the school with no child yet) but no dossier — the step
    // before "Brouillon". An account has no campaign and no dossier status,
    // so the block belongs to the plain pipeline only: active view, no status
    // pill, and no dossier type other than "new family" (these accounts are
    // new families by definition).
    const showNoDossier =
      currentView === "active" &&
      !statusFilter &&
      (!typeFilter || typeFilter === "newFamily");
    const accountsExpanded = accounts === "all";

    const [
      apps,
      cycles,
      activeCount,
      archivedCount,
      deletedCount,
      noDossierAccounts,
      noDossierTotal,
      unverifiedSubmitters,
    ] = await Promise.all([
        db.application.findMany({
          where,
          orderBy: orderByFor(sortKey, sortDir),
          // Narrow select — the list renders only these scalars + the two
          // relations. Crucially this drops the four heavy JSON blobs
          // (parentAnswers / studentAnswers / dossierAnswers / tabsCompleted)
          // and ~50 other unused columns that the default row would haul.
          select: {
            id: true,
            status: true,
            childFirstName: true,
            childLastName: true,
            requestedLevel: true,
            submittedAt: true,
            existingStudentId: true,
            archived: true,
            deletedAt: true,
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
        db.application.count({
          where: { ...countBase, archived: false, deletedAt: null },
        }),
        db.application.count({
          where: { ...countBase, archived: true, deletedAt: null },
        }),
        db.application.count({
          where: { ...countBase, deletedAt: { not: null } },
        }),
        showNoDossier
          ? db.user.findMany({
              where: PENDING_WITHOUT_DOSSIER_WHERE,
              // Newest first: the accounts to follow up on are the recent ones.
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: accountsExpanded ? NO_DOSSIER_MAX : NO_DOSSIER_PREVIEW,
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                emailVerified: true,
                createdAt: true,
                _count: { select: { submittedApps: true } },
              },
            })
          : Promise.resolve<NoDossierAccount[]>([]),
        showNoDossier
          ? db.user.count({ where: PENDING_WITHOUT_DOSSIER_WHERE })
          : Promise.resolve(0),
        // Submitters whose address was never confirmed — flagged next to
        // their dossiers. Pending accounts only (see ./_pending.ts): once a
        // child is linked the school vouches for the family.
        db.user.findMany({
          where: {
            ...UNVERIFIED_PENDING_PARENT_WHERE,
            submittedApps: { some: {} },
          },
          select: { id: true },
        }),
      ]);
    const unverifiedSubmitterIds = new Set(unverifiedSubmitters.map((u) => u.id));

    const newFamilyApps: AdminApp[] = [];
    const existingFamilyApps: AdminApp[] = [];
    const typeCounts: Record<AppType, number> = {
      renewal: 0,
      fratrie: 0,
      newFamily: 0,
    };

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
        archived: a.archived,
        deleted: a.deletedAt !== null,
        cycle: a.cycle,
        submittedBy: {
          id: a.submittedBy.id,
          email: a.submittedBy.email,
          name: a.submittedBy.name,
          emailUnverified: unverifiedSubmitterIds.has(a.submittedBy.id),
        },
        existingChildren: childCount,
      };
      const rowType = appTypeOf(row);
      typeCounts[rowType]++;
      if (typeFilter && rowType !== typeFilter) continue;
      if (childCount > 0) existingFamilyApps.push(row);
      else newFamilyApps.push(row);
    }

    const viewParam = currentView === "active" ? undefined : currentView;
    // Keeps the "Comptes sans dossier" block expanded across sort / filter
    // clicks; dropped on a view change (the block only exists on "active").
    const accountsParam = accountsExpanded ? "all" : undefined;
    const preserve: Record<string, string | undefined> = {
      status: statusFilter,
      cycleId: cycleFilter,
      sort: sortKey,
      dir: sortDir,
      view: viewParam,
      type: typeFilter,
      accounts: accountsParam,
    };
    const filterPreserve: Record<string, string | undefined> = {
      cycleId: preserve.cycleId,
      sort: preserve.sort,
      dir: preserve.dir,
      view: preserve.view,
      type: preserve.type,
      accounts: accountsParam,
    };
    // For the type pills: preserve everything except type itself.
    const typePreserve: Record<string, string | undefined> = {
      status: statusFilter,
      cycleId: preserve.cycleId,
      sort: preserve.sort,
      dir: preserve.dir,
      view: preserve.view,
      accounts: accountsParam,
    };
    // For the view-tab links: drop the status pill so a "Deleted" tab
    // doesn't get an unhelpful status filter inherited from elsewhere.
    const viewPreserve: Record<string, string | undefined> = {
      cycleId: cycleFilter,
      sort: sortKey,
      dir: sortDir,
      type: typeFilter,
    };

    // IDs the bulk toolbar / "select all" header treats as selectable —
    // only the rows the current type filter leaves visible.
    const allVisibleIds = [...newFamilyApps, ...existingFamilyApps].map(
      (a) => a.id,
    );

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

          {/* View tabs — Active / Archived / Deleted */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border-subtle)] pb-3">
            <ViewTab
              href={hrefWith(BASE, { ...viewPreserve, view: undefined })}
              label={t("viewActive")}
              count={activeCount}
              active={currentView === "active"}
            />
            <ViewTab
              href={hrefWith(BASE, { ...viewPreserve, view: "archived" })}
              label={t("viewArchived")}
              count={archivedCount}
              active={currentView === "archived"}
            />
            <ViewTab
              href={hrefWith(BASE, { ...viewPreserve, view: "deleted" })}
              label={t("viewDeleted")}
              count={deletedCount}
              active={currentView === "deleted"}
            />
          </div>

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

          {/* Type pills — réinscription / fratrie (nouvel enfant, famille
              existante) / nouvelle famille. Counts follow the current
              view + cycle + status filters. */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={hrefWith(BASE, { ...typePreserve, type: undefined })}
              label={t("typeAll")}
              active={!typeFilter}
            />
            <FilterPill
              href={hrefWith(BASE, { ...typePreserve, type: "renewal" })}
              label={`${t("typeRenewal")} (${typeCounts.renewal})`}
              active={typeFilter === "renewal"}
            />
            <FilterPill
              href={hrefWith(BASE, { ...typePreserve, type: "fratrie" })}
              label={`${t("typeFratrie")} (${typeCounts.fratrie})`}
              active={typeFilter === "fratrie"}
            />
            <FilterPill
              href={hrefWith(BASE, { ...typePreserve, type: "newFamily" })}
              label={`${t("typeNewFamily")} (${typeCounts.newFamily})`}
              active={typeFilter === "newFamily"}
            />
          </div>

          {/* Step before a dossier exists: families that have an account but
              have not started one. Read-only here — accounts are managed
              (and deleted) in the Parents console. Hidden when there are none. */}
          {showNoDossier && noDossierTotal > 0 ? (
            <NoDossierAccounts
              accounts={noDossierAccounts}
              total={noDossierTotal}
              expanded={accountsExpanded}
              canOpenParents={canOpenParents}
              expandHref={hrefWith(BASE, { ...preserve, accounts: "all" })}
              collapseHref={hrefWith(BASE, { ...preserve, accounts: undefined })}
              t={t}
              tPar={tPar}
            />
          ) : null}

          {/* Bulk selection context wraps both groups, so the toolbar can
              act across new- and existing-family selections at once. */}
          <BulkSelectionProvider allIds={allVisibleIds}>
            <AdmissionsBulkToolbar view={currentView} />

            <ApplicationGroup
              title={t("groupNewFamily")}
              description={t("groupNewFamilyHint")}
              icon={Sparkles}
              iconTone="bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]"
              apps={newFamilyApps}
              emptyLabel={t("groupEmpty")}
              t={t}
              tPar={tPar}
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
              tPar={tPar}
              sortKey={sortKey}
              sortDir={sortDir}
              preserve={preserve}
              showChildCount
            />
          </BulkSelectionProvider>
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
  tPar,
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
  t: Translator;
  /** `parents` namespace — owns the "e-mail non vérifié" wording. */
  tPar: Translator;
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
            <TH className="w-[1%] pe-0">
              <BulkHeaderCheckbox ariaLabel={t("bulkSelectAllLabel")} />
            </TH>
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
            <EmptyRow colSpan={8}>{emptyLabel}</EmptyRow>
          ) : (
            apps.map((a) => (
              <TR
                key={a.id}
                className={
                  a.deleted
                    ? "opacity-50"
                    : a.archived
                      ? "opacity-60"
                      : undefined
                }
              >
                <TD className="pe-0">
                  <BulkRowCheckbox
                    id={a.id}
                    ariaLabel={t("bulkSelectRow", {
                      name: `${a.childLastName} ${a.childFirstName}`,
                    })}
                  />
                </TD>
                <TD>
                  <Link
                    href={`/admissions-admin/${a.id}`}
                    className="group flex items-center gap-2"
                  >
                    <span className="font-medium text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                      {a.childLastName} {a.childFirstName}
                    </span>
                    {a.deleted ? (
                      <span className="inline-flex items-center rounded-full bg-[color:var(--color-danger)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-danger)]">
                        {t("deletedBadge")}
                      </span>
                    ) : a.archived ? (
                      <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                        {t("archivedBadge")}
                      </span>
                    ) : null}
                    {a.isRenewal ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-brand-700)]">
                        <RefreshCw className="size-2.5" aria-hidden />
                        {t("renewalBadge")}
                      </span>
                    ) : a.existingChildren > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-success-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-success-soft-fg)]">
                        <Users className="size-2.5" aria-hidden />
                        {t("fratrieBadge")}
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
                  {a.submittedBy.emailUnverified ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {/* Show WHICH address is unconfirmed without relying on
                          the tooltip (touch, keyboard). Skipped when the
                          address already is the label above. */}
                      {a.submittedBy.name ? (
                        <span className="text-xs">{a.submittedBy.email}</span>
                      ) : null}
                      <UnverifiedEmailBadge
                        label={tPar("emailUnverified")}
                        title={tPar("emailUnverifiedHint", {
                          email: a.submittedBy.email,
                        })}
                      />
                    </div>
                  ) : null}
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
                  <div className="inline-flex items-center gap-1">
                    <AdmissionRowActions
                      applicationId={a.id}
                      childLabel={`${a.childLastName} ${a.childFirstName}`}
                      archived={a.archived}
                      deleted={a.deleted}
                    />
                    <Link
                      href={`/admissions-admin/${a.id}`}
                      className="inline-flex size-7 items-center justify-center rounded text-[color:var(--color-brand-600)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-brand-700)]"
                      aria-label={t("openApplication")}
                    >
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

type Translator = (
  key: string,
  opts?: Record<string, string | number | Date>,
) => string;

/**
 * "Comptes sans dossier" — pending parent accounts whose family has not
 * started a dossier. Deliberately read-only: the Parents console stays
 * the one place where an account is archived or deleted.
 */
function NoDossierAccounts({
  accounts,
  total,
  expanded,
  canOpenParents,
  expandHref,
  collapseHref,
  t,
  tPar,
}: {
  accounts: NoDossierAccount[];
  total: number;
  expanded: boolean;
  canOpenParents: boolean;
  expandHref: string;
  collapseHref: string;
  t: Translator;
  tPar: Translator;
}) {
  const hidden = total - accounts.length;
  // Nothing to expand or collapse while the preview already shows everything.
  const canToggle = total > NO_DOSSIER_PREVIEW;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]">
          <UserPlus className="size-4" aria-hidden />
        </div>
        {/* min-w-40 lets the "manage" link wrap below the title on phones
            instead of crushing it into a narrow column. */}
        <div className="min-w-40 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[color:var(--color-foreground)]">
            {t("groupNoDossier")}
            <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium tabular-nums text-[color:var(--color-foreground-muted)]">
              {total}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
            {t("groupNoDossierHint")}
          </p>
        </div>
        {canOpenParents ? (
          <Link
            href="/admin/parents?view=pending"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)] hover:underline"
          >
            {t("noDossierManage")}
            <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
          </Link>
        ) : null}
      </div>
      <Table>
        <THead>
          <tr>
            <TH>{tPar("colName")}</TH>
            <TH>{tPar("colEmail")}</TH>
            <TH>{tPar("colCreated")}</TH>
          </tr>
        </THead>
        <tbody>
          {accounts.map((a) => {
            const label = displayName(a) || a.email;
            return (
              <TR key={a.id}>
                <TD>
                  {canOpenParents ? (
                    <Link
                      href={`/admin/parents/${a.id}`}
                      className="font-medium text-[color:var(--color-foreground)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)]"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="font-medium text-[color:var(--color-foreground)]">
                      {label}
                    </span>
                  )}
                  {/* The predicate ignores dossiers in the trash, so every
                      dossier this account still owns is a deleted one: say
                      so rather than imply it never started. */}
                  {a._count.submittedApps > 0 ? (
                    <div className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                      {t("noDossierDeleted", { count: a._count.submittedApps })}
                    </div>
                  ) : null}
                </TD>
                <TD className="text-[color:var(--color-foreground-muted)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{a.email}</span>
                    {a.emailVerified === null ? (
                      <UnverifiedEmailBadge
                        label={tPar("emailUnverified")}
                        title={tPar("emailUnverifiedHint", { email: a.email })}
                      />
                    ) : null}
                  </div>
                </TD>
                <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                  {a.createdAt.toISOString().slice(0, 10)}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      {canToggle ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-border-subtle)] px-6 py-3 text-xs text-[color:var(--color-foreground-muted)]">
          {/* Never a silent cut: say how many of the total are on screen. */}
          <span>
            {hidden > 0
              ? t("noDossierShown", { shown: accounts.length, count: total })
              : null}
          </span>
          {/* scroll={false}: expand / collapse in place, like the filter
              pills and sort headers — no jump back to the top of the page. */}
          {expanded ? (
            <Link
              href={collapseHref}
              scroll={false}
              className="font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)] hover:underline"
            >
              {t("noDossierShowLess")}
            </Link>
          ) : (
            <Link
              href={expandHref}
              scroll={false}
              className="font-medium text-[color:var(--color-brand-600)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-700)] hover:underline"
            >
              {/* Above the cap "show all" would be a lie: name the cap. */}
              {total > NO_DOSSIER_MAX
                ? t("noDossierShowMax", { max: NO_DOSSIER_MAX })
                : t("noDossierShowAll")}
            </Link>
          )}
        </div>
      ) : null}
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

function ViewTab({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground)] transition-colors"
          : "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]"
      }
    >
      <span>{label}</span>
      <span
        className={
          active
            ? "inline-flex min-w-[20px] items-center justify-center rounded-full bg-[color:var(--color-brand-50)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--color-brand-700)]"
            : "inline-flex min-w-[20px] items-center justify-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--color-foreground-muted)]"
        }
      >
        {count}
      </span>
      {active ? (
        <span
          aria-hidden
          className="absolute -bottom-3 left-0 right-0 h-0.5 rounded-full bg-[color:var(--color-brand-600)]"
        />
      ) : null}
    </Link>
  );
}

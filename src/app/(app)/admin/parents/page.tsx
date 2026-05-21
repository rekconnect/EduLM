import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Prisma, UserStatus } from "@prisma/client";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { SortableTH, type SortDir } from "@/components/ui/sortable-th";
import { FilterPill } from "@/components/ui/filter-pill";
import {
  BulkHeaderCheckbox,
  BulkRowCheckbox,
  BulkSelectionProvider,
} from "@/components/bulk-selection";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";
import { displayName } from "@/lib/names";
import { ParentsSearchBox } from "./_search-box";
import { ParentRowActions } from "./_row-actions";
import { ParentsBulkToolbar } from "./_bulk-toolbar";

const BASE = "/admin/parents";

const STATUS_KEY: Record<string, string> = {
  ACTIVE: "statusActive",
  INVITED: "statusInvited",
  DISABLED: "statusDisabled",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE:
    "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]",
  INVITED:
    "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
  DISABLED:
    "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
};

const STATUSES: UserStatus[] = ["ACTIVE", "INVITED", "DISABLED"];

const SORTABLE_COLUMNS = [
  "name",
  "email",
  "children",
  "status",
  "createdAt",
] as const;
type SortKey = (typeof SORTABLE_COLUMNS)[number];

function orderByFor(
  sort: SortKey,
  dir: SortDir,
): Prisma.UserOrderByWithRelationInput {
  switch (sort) {
    case "email":
      return { email: dir };
    case "status":
      return { status: dir };
    case "createdAt":
      return { createdAt: dir };
    case "children":
      return { guardianProfile: { childLinks: { _count: dir } } };
    case "name":
    default:
      return { name: dir };
  }
}

const VIEWS = ["active", "archived", "deleted"] as const;
type View = (typeof VIEWS)[number];

function parseView(raw: string | undefined): View {
  return (VIEWS as readonly string[]).includes(raw ?? "")
    ? (raw as View)
    : "active";
}

export default async function ParentsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    sort?: string;
    dir?: string;
    view?: string;
  }>;
}) {
  const { q = "", status, sort, dir, view } = await searchParams;
  const currentView: View = parseView(view);
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("parents");
    const query = q.trim();

    const sortKey: SortKey = (SORTABLE_COLUMNS as readonly string[]).includes(
      sort ?? "",
    )
      ? (sort as SortKey)
      : "name";
    const sortDir: SortDir = dir === "desc" ? "desc" : "asc";

    const statusFilter: UserStatus | undefined = (STATUSES as string[]).includes(
      status ?? "",
    )
      ? (status as UserStatus)
      : undefined;

    // Three mutually-exclusive lifecycle buckets. Status filter still
    // applies on top — e.g. "Archived parents who are also DISABLED".
    // Typed as a loose record because `archived` / `deletedAt` are new
    // columns the generated Prisma types only learn about after
    // `npx prisma generate` runs.
    const lifecycleWhere =
      currentView === "active"
        ? { archived: false, deletedAt: null }
        : currentView === "archived"
          ? { archived: true, deletedAt: null }
          : { deletedAt: { not: null } as const };

    const parents = await db.user.findMany({
      where: {
        role: "PARENT",
        ...lifecycleWhere,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(query
          ? {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
                {
                  guardianProfile: {
                    childLinks: {
                      some: {
                        student: {
                          OR: [
                            { firstName: { contains: query, mode: "insensitive" } },
                            { lastName: { contains: query, mode: "insensitive" } },
                          ],
                        },
                      },
                    },
                  },
                },
                {
                  guardianProfile: {
                    relation: { contains: query, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: orderByFor(sortKey, sortDir),
      take: 200,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        createdAt: true,
        archived: true,
        deletedAt: true,
        guardianProfile: {
          select: {
            _count: { select: { childLinks: true } },
            family: { select: { code: true } },
            childLinks: {
              select: { student: { select: { firstName: true, lastName: true } } },
              take: 3,
            },
          },
        },
      },
    });

    // Counts for the view tabs. Status + query filters intentionally
    // ignored so each tab shows the lifecycle-bucket total, not the
    // intersection — otherwise an admin filtering by query sees "0" on
    // every tab and can't tell where their search target lives.
    const [activeCount, archivedCount, deletedCount] = await Promise.all([
      db.user.count({
        where: { role: "PARENT", archived: false, deletedAt: null },
      }),
      db.user.count({
        where: { role: "PARENT", archived: true, deletedAt: null },
      }),
      db.user.count({
        where: { role: "PARENT", deletedAt: { not: null } },
      }),
    ]);

    const count = parents.length;
    const countLabel = query
      ? t("countWithQuery", { count, query })
      : t("countAll", { count });

    // Preserve other params when navigating via sort/filter links.
    const viewParam = currentView === "active" ? undefined : currentView;
    const preserve: Record<string, string | undefined> = {
      q: query || undefined,
      status: statusFilter,
      sort: sortKey,
      dir: sortDir,
      view: viewParam,
    };
    const filterPreserve: Record<string, string | undefined> = {
      q: preserve.q,
      sort: preserve.sort,
      dir: preserve.dir,
      view: preserve.view,
    };
    const viewPreserve: Record<string, string | undefined> = {
      q: preserve.q,
      sort: preserve.sort,
      dir: preserve.dir,
    };
    const allVisibleIds = parents.map((p) => p.id);

    return (
        <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("lead")}
            action={
              <LinkButton href="/admin/parents/new" size="sm" className="gap-1.5">
                <Plus className="size-4" aria-hidden />
                {t("createCta")}
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <ParentsSearchBox />
            </div>
            <p
              aria-live="polite"
              className="text-xs text-[color:var(--color-foreground-muted)]"
            >
              {countLabel}
            </p>
          </div>

          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={hrefWith(BASE, { ...filterPreserve, status: undefined })}
              label={t("filterAll")}
              active={!statusFilter}
            />
            {STATUSES.map((s) => (
              <FilterPill
                key={s}
                href={hrefWith(BASE, { ...filterPreserve, status: s })}
                label={t(STATUS_KEY[s] ?? "statusActive")}
                active={statusFilter === s}
                tone={STATUS_TONE[s]}
              />
            ))}
          </div>

          {count === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)] py-12 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Users className="size-6" aria-hidden />
              </div>
              <p className="max-w-xs text-sm text-[color:var(--color-foreground-muted)]">
                {query || statusFilter
                  ? t("emptySearch")
                  : currentView === "archived"
                    ? t("emptyArchived")
                    : currentView === "deleted"
                      ? t("emptyDeleted")
                      : t("empty")}
              </p>
              {!query && !statusFilter && currentView === "active" ? (
                <div className="mt-5">
                  <LinkButton href="/admin/parents/new" size="sm" className="gap-1.5">
                    <Plus className="size-4" aria-hidden />
                    {t("createCta")}
                  </LinkButton>
                </div>
              ) : null}
            </div>
          ) : (
            <BulkSelectionProvider allIds={allVisibleIds}>
              <ParentsBulkToolbar view={currentView} />
            <Table>
              <THead>
                <tr>
                  <TH className="w-[1%] pe-0">
                    <BulkHeaderCheckbox ariaLabel={t("bulkSelectAllLabel")} />
                  </TH>
                  <SortableTH
                    label={t("colName")}
                    column="name"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colEmail")}
                    column="email"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colChildren")}
                    column="children"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                    align="end"
                  />
                  <SortableTH
                    label={t("colStatus")}
                    column="status"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <SortableTH
                    label={t("colCreated")}
                    column="createdAt"
                    currentSort={sortKey}
                    currentDir={sortDir}
                    baseUrl={BASE}
                    preserve={preserve}
                  />
                  <TH className="text-end" />
                </tr>
              </THead>
              <tbody>
                {parents.map((p) => {
                  const childPreview = p.guardianProfile?.childLinks
                    .map((l) => `${l.student.firstName} ${l.student.lastName}`)
                    .join(", ");
                  const totalKids = p.guardianProfile?._count.childLinks ?? 0;
                  const shownKids = p.guardianProfile?.childLinks.length ?? 0;
                  const isDeleted = p.deletedAt !== null;
                  const isArchived = p.archived;
                  return (
                    <TR
                      key={p.id}
                      className={
                        isDeleted
                          ? "opacity-50"
                          : isArchived
                            ? "opacity-60"
                            : undefined
                      }
                    >
                      <TD className="pe-0">
                        <BulkRowCheckbox
                          id={p.id}
                          ariaLabel={t("bulkSelectRow", {
                            name: displayName(p) || p.email,
                          })}
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/admin/parents/${p.id}`}
                          className="group flex items-center gap-3"
                        >
                          <ParentInitials name={displayName(p)} email={p.email} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                                {displayName(p) || "—"}
                              </span>
                              {isDeleted ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-danger)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-danger)]">
                                  {t("deletedBadge")}
                                </span>
                              ) : isArchived ? (
                                <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                                  {t("archivedBadge")}
                                </span>
                              ) : null}
                              {p.guardianProfile?.family?.code ? (
                                <span
                                  className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-foreground-muted)]"
                                  title="Code famille"
                                >
                                  {p.guardianProfile.family.code}
                                </span>
                              ) : null}
                            </div>
                            {childPreview ? (
                              <div className="mt-0.5 truncate text-xs text-[color:var(--color-foreground-muted)]">
                                {childPreview}
                                {totalKids > shownKids
                                  ? ` +${totalKids - shownKids}`
                                  : ""}
                              </div>
                            ) : null}
                          </div>
                        </Link>
                      </TD>
                      <TD className="text-[color:var(--color-foreground-muted)]">
                        {p.email}
                      </TD>
                      <TD className="text-end tabular-nums">
                        {totalKids > 0 ? (
                          <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-xs font-semibold text-[color:var(--color-brand-700)]">
                            {totalKids}
                          </span>
                        ) : (
                          <span className="text-[color:var(--color-foreground-subtle)]">
                            0
                          </span>
                        )}
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[p.status],
                          )}
                        >
                          {t(STATUS_KEY[p.status] ?? "statusActive")}
                        </span>
                      </TD>
                      <TD className="tabular-nums text-[color:var(--color-foreground-muted)]">
                        {p.createdAt.toISOString().slice(0, 10)}
                      </TD>
                      <TD className="text-end">
                        <ParentRowActions
                          parentUserId={p.id}
                          parentLabel={displayName(p) || p.email}
                          archived={isArchived}
                          deleted={isDeleted}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            </BulkSelectionProvider>
          )}
        </main>
    );
  });
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

function ParentInitials({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const initials = (
    parts[0]?.charAt(0) + (parts[1]?.charAt(0) ?? "")
  ).toUpperCase();
  return (
    <div
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-xs font-semibold text-[color:var(--color-brand-700)]"
    >
      {initials || "·"}
    </div>
  );
}

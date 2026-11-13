import type { Prisma } from "@prisma/client";
import { unscopedDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenant-context";
import { hardDeleteParentAccounts } from "@/lib/parent-hard-delete";
import { staffIdentityGuard } from "@/lib/staff-identity";
import { ABANDONED_SIGNUP_WHERE } from "@/app/(app)/admin/parents/_pending";

/**
 * Automatic purge of abandoned sign-ups.
 *
 * A school can set `Tenant.signupRetentionDays` (Settings → Formulaires). A
 * parent account that registered ITSELF and whose family has no dossier
 * (ABANDONED_SIGNUP_WHERE) is then hard-deleted once its countdown ends.
 *
 * The countdown is `days` long and starts at the LATEST of four instants, so
 * nobody is ever deleted without having had `days` full days to act, and a
 * date shown to a family can only ever move LATER:
 *   1. the account's creation;
 *   2. the account's last modification (`User.updatedAt`) — which is also how
 *      "the family just lost its last dossier" is recorded: every code path
 *      that hard-deletes a dossier calls `restartSignupCountdownFor`;
 *   3. `Tenant.signupRetentionSince` — when the school switched the rule on or
 *      changed the delay, and whenever an edit to a campaign would otherwise
 *      have pulled the dates earlier (`keepSignupDeadlinesStable`);
 *   4. the opening of the admission campaign (the oldest cycle that is open
 *      right now).
 * While NO cycle is open a family cannot start a dossier at all, so the rule
 * is suspended: nothing is deleted and no deadline is shown.
 *
 * What is SHOWN (family notice, Admissions row, dry run) and what is DELETED
 * come from the same predicate, `eligibleWhere` — including the staff guard,
 * so an address the job refuses to touch is never announced as due.
 *
 * Reads here use the unscoped client with an explicit `tenantId` on every
 * query: this code runs from the cron route and from nested server components,
 * where the request's tenant context is not available. The delete itself goes
 * through `hardDeleteParentAccounts` inside `runWithTenant`.
 */

export const SIGNUP_RETENTION_MIN_DAYS = 1;
export const SIGNUP_RETENTION_MAX_DAYS = 365;

const DAY_MS = 86_400_000;

/**
 * The actor of the automatic purge. Deliberately NOT "SCHOOL_ADMIN": the
 * staff-identity guard then applies in full, so a staff hat or a staff-domain
 * address is never reachable by the job.
 */
const SYSTEM_ACTOR = { role: "SYSTEM" } as const;

function openCycleWhere(tenantId: string, now: Date): Prisma.AdmissionCycleWhereInput {
  // Same test as the parent pages: can a family start a dossier right now?
  return {
    tenantId,
    isActive: true,
    openAt: { lte: now },
    OR: [{ closeAt: null }, { closeAt: { gte: now } }],
  };
}

/** Is at least one admission cycle open — can a family start a dossier now? */
export async function hasOpenCampaign(
  tenantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const n = await unscopedDb().admissionCycle.count({
    where: openCycleWhere(tenantId, now),
  });
  return n > 0;
}

export type RetentionWindow = {
  days: number;
  /** No account's countdown starts before this instant. */
  floor: Date;
};

export type RetentionState =
  | { status: "off" }
  /** The rule is set but no campaign is open: suspended. */
  | { status: "suspended"; days: number }
  | { status: "active"; window: RetentionWindow };

function validDays(days: number | null | undefined): days is number {
  return (
    typeof days === "number" &&
    Number.isInteger(days) &&
    days >= SIGNUP_RETENTION_MIN_DAYS &&
    days <= SIGNUP_RETENTION_MAX_DAYS
  );
}

/**
 * The rule's state from the tenant's setting and its currently OPEN cycles.
 * Pure — no database — so the clock rules can be tested on their own.
 */
export function retentionStateFrom(
  setting: { days: number | null | undefined; since: Date | null | undefined },
  openCycles: { openAt: Date; createdAt: Date }[],
  now: Date,
): RetentionState {
  const { days } = setting;
  if (!validDays(days)) return { status: "off" };
  if (openCycles.length === 0) return { status: "suspended", days };

  // A cycle created with a past opening date was not usable before it existed.
  const openSince = Math.min(
    ...openCycles.map((c) => Math.max(c.openAt.getTime(), c.createdAt.getTime())),
  );
  // `since` is written together with `days`; if it is somehow missing, start
  // the clock now rather than at the epoch — never delete on a doubt.
  const since = setting.since?.getTime() ?? now.getTime();
  return {
    status: "active",
    window: { days, floor: new Date(Math.max(since, openSince)) },
  };
}

/** Where the rule stands for one tenant at `now`. */
export async function getRetentionState(
  tenantId: string,
  now: Date = new Date(),
): Promise<RetentionState> {
  const prisma = unscopedDb();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { signupRetentionDays: true, signupRetentionSince: true },
  });
  if (!validDays(tenant?.signupRetentionDays)) return { status: "off" };
  const cycles = await prisma.admissionCycle.findMany({
    where: openCycleWhere(tenantId, now),
    select: { openAt: true, createdAt: true },
  });
  return retentionStateFrom(
    { days: tenant?.signupRetentionDays, since: tenant?.signupRetentionSince },
    cycles,
    now,
  );
}

type AccountClock = { createdAt: Date; updatedAt: Date };

/** The instant from which this account may be deleted. */
export function signupDeadline(account: AccountClock, w: RetentionWindow): Date {
  const start = Math.max(
    account.createdAt.getTime(),
    account.updatedAt.getTime(),
    w.floor.getTime(),
  );
  return new Date(start + w.days * DAY_MS);
}

/**
 * The accounts of one tenant the rule applies to: the shared predicate plus
 * the staff guard of the system actor. Used for display AND for deletion, so
 * the two can never disagree.
 */
async function eligibleWhere(tenantId: string): Promise<Prisma.UserWhereInput> {
  const guard = (await staffIdentityGuard(SYSTEM_ACTOR, tenantId)) as Prisma.UserWhereInput;
  return { AND: [ABANDONED_SIGNUP_WHERE, { tenantId }, guard] };
}

/**
 * Deadline of ONE account, or null when the rule does not apply to it (rule
 * off or suspended, account confirmed, disabled, created by the school, on a
 * staff address, or its family has a dossier). Feeds the notice on the
 * parent's pages.
 */
export async function getSignupDeadlineForUser(
  userId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<Date | null> {
  const state = await getRetentionState(tenantId, now);
  if (state.status !== "active") return null;
  const row = await unscopedDb().user.findFirst({
    where: { AND: [await eligibleWhere(tenantId), { id: userId }] },
    select: { createdAt: true, updatedAt: true },
  });
  return row ? signupDeadline(row, state.window) : null;
}

/**
 * Deadlines of the accounts in `userIds` the rule applies to (others are
 * simply absent from the map). Feeds the Admissions "Comptes sans dossier"
 * block.
 */
export async function getSignupDeadlines(
  tenantId: string,
  userIds: string[],
  now: Date = new Date(),
): Promise<{ state: RetentionState; deadlines: Map<string, Date> }> {
  const state = await getRetentionState(tenantId, now);
  const deadlines = new Map<string, Date>();
  if (state.status !== "active" || userIds.length === 0) return { state, deadlines };
  const rows = await unscopedDb().user.findMany({
    where: { AND: [await eligibleWhere(tenantId), { id: { in: userIds } }] },
    select: { id: true, createdAt: true, updatedAt: true },
  });
  for (const r of rows) deadlines.set(r.id, signupDeadline(r, state.window));
  return { state, deadlines };
}

// ── Keeping the dates honest ─────────────────────────────────────────────────

/** Restart every countdown of a tenant from `now`. No-op while the rule is off. */
export async function restartSignupRetentionClock(
  tenantId: string,
  now: Date = new Date(),
): Promise<void> {
  await unscopedDb().tenant.updateMany({
    where: { id: tenantId, signupRetentionDays: { not: null } },
    data: { signupRetentionSince: now },
  });
}

/**
 * Wrap any admin write that can change which cycles are open or since when
 * (the campaign's active flag, its dates). If the write would start the
 * countdowns (no campaign open → one open) or pull them EARLIER (an older
 * cycle re-opened next to a newer one, an opening date moved back), every
 * countdown is restarted from now instead: a restart can only give families
 * more time, never less than the date they were shown.
 */
export async function keepSignupDeadlinesStable<T>(
  tenantId: string,
  write: () => Promise<T>,
): Promise<T> {
  const before = await getRetentionState(tenantId);
  const result = await write();
  const now = new Date();
  const after = await getRetentionState(tenantId, now);
  if (clockMustRestart(before, after)) {
    await restartSignupRetentionClock(tenantId, now);
  }
  return result;
}

/**
 * Did a change start the countdowns, or pull them earlier? Then they must be
 * restarted. Pure, see `keepSignupDeadlinesStable`.
 */
export function clockMustRestart(before: RetentionState, after: RetentionState): boolean {
  return (
    after.status === "active" &&
    (before.status !== "active" || after.window.floor < before.window.floor)
  );
}

/**
 * To call after dossiers were HARD-deleted (a parent cancelling a draft, an
 * admin emptying the trash or deleting a campaign): the submitters and the
 * other responsables of their families get a fresh, full countdown. Without
 * this, a family that had a dossier for months — and therefore never saw a
 * deadline — would be due the very night its last dossier disappears.
 *
 * Any new code path that hard-deletes an Application must call this too.
 * No-op while the rule is off (switching it on restarts everyone anyway).
 */
export async function restartSignupCountdownFor(
  tenantId: string,
  submitterIds: string[],
  now: Date = new Date(),
): Promise<void> {
  const ids = [...new Set(submitterIds)];
  if (ids.length === 0) return;
  const prisma = unscopedDb();
  const on = await prisma.tenant.count({
    where: { id: tenantId, signupRetentionDays: { not: null } },
  });
  if (on === 0) return;
  await prisma.user.updateMany({
    where: {
      tenantId,
      role: "PARENT",
      OR: [
        { id: { in: ids } },
        {
          guardianProfile: {
            family: { guardians: { some: { userId: { in: ids } } } },
          },
        },
      ],
    },
    data: { updatedAt: now },
  });
}

// ── The purge ────────────────────────────────────────────────────────────────

export type PurgeCandidate = { id: string; email: string; createdAt: Date };

export type TenantPurgeReport = {
  tenantId: string;
  slug: string;
  days: number;
  /**
   * - "suspended": no campaign open, nothing may be deleted;
   * - "waiting": the rule or the campaign is younger than the delay, so no
   *   account can be due yet (`nextPossible` = earliest instant one could be);
   * - "dry-run" / "purged": `candidates` are the accounts due at `now`.
   */
  status: "suspended" | "waiting" | "dry-run" | "purged";
  nextPossible: Date | null;
  /** Accounts due now, oldest first — at most `maxPerTenant`. */
  candidates: PurgeCandidate[];
  /** Due accounts beyond `maxPerTenant`, left for the next run. */
  notListed: number;
  deleted: number;
  /** Listed but not deleted: changed state meanwhile, or FK refusal. */
  skipped: number;
  /** Listed but not attempted because the time budget ran out. */
  notAttempted: number;
};

const BATCH = 25;

/**
 * Delete (or, with `dryRun`, only list) the abandoned sign-ups that are due,
 * for every tenant that set a delay — or only `tenantSlug`.
 *
 * Safe to run twice or to miss a run: it works from the current state, never
 * from "what happened since last time". `daysOverride` is for previews only
 * and is refused together with a real run.
 */
export async function purgeAbandonedSignups(opts: {
  dryRun: boolean;
  tenantSlug?: string;
  now?: Date;
  maxPerTenant?: number;
  timeBudgetMs?: number;
  daysOverride?: number;
}): Promise<TenantPurgeReport[]> {
  if (opts.daysOverride !== undefined && !opts.dryRun) {
    throw new Error("daysOverride is a preview option — it cannot be used with a real run");
  }
  const now = opts.now ?? new Date();
  const maxPerTenant = opts.maxPerTenant ?? 300;
  const startedAt = Date.now();
  const outOfTime = () =>
    opts.timeBudgetMs !== undefined && Date.now() - startedAt > opts.timeBudgetMs;

  const prisma = unscopedDb();
  const tenants = await prisma.tenant.findMany({
    where: {
      ...(opts.tenantSlug ? { slug: opts.tenantSlug } : {}),
      ...(opts.daysOverride === undefined ? { signupRetentionDays: { not: null } } : {}),
    },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true },
  });

  const reports: TenantPurgeReport[] = [];
  for (const tenant of tenants) {
    let state = await getRetentionState(tenant.id, now);
    if (opts.daysOverride !== undefined) {
      // Preview "what if the delay were N days": keep the real floor when the
      // rule is on, otherwise pretend it was switched on long ago.
      if (!validDays(opts.daysOverride)) throw new Error("daysOverride out of range");
      if (state.status === "active") {
        state = { status: "active", window: { ...state.window, days: opts.daysOverride } };
      } else if (state.status === "off") {
        state = (await hasOpenCampaign(tenant.id, now))
          ? { status: "active", window: { days: opts.daysOverride, floor: new Date(0) } }
          : { status: "suspended", days: opts.daysOverride };
      } else {
        state = { status: "suspended", days: opts.daysOverride };
      }
    }
    if (state.status === "off") continue;

    const base: TenantPurgeReport = {
      tenantId: tenant.id,
      slug: tenant.slug,
      days: state.status === "active" ? state.window.days : state.days,
      status: "suspended",
      nextPossible: null,
      candidates: [],
      notListed: 0,
      deleted: 0,
      skipped: 0,
      notAttempted: 0,
    };
    if (state.status === "suspended") {
      reports.push(base);
      continue;
    }

    const { window } = state;
    const cutoff = new Date(now.getTime() - window.days * DAY_MS);
    if (window.floor > cutoff) {
      reports.push({
        ...base,
        status: "waiting",
        nextPossible: new Date(window.floor.getTime() + window.days * DAY_MS),
      });
      continue;
    }

    // Due ⇔ signupDeadline ≤ now ⇔ max(createdAt, updatedAt, floor) ≤ cutoff:
    // the floor is checked above, the two account dates here.
    const due: Prisma.UserWhereInput = {
      AND: [
        await eligibleWhere(tenant.id),
        { createdAt: { lte: cutoff }, updatedAt: { lte: cutoff } },
      ],
    };
    const [candidates, total] = await Promise.all([
      prisma.user.findMany({
        where: due,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: maxPerTenant,
        select: { id: true, email: true, createdAt: true },
      }),
      prisma.user.count({ where: due }),
    ]);
    const report: TenantPurgeReport = {
      ...base,
      status: opts.dryRun ? "dry-run" : "purged",
      candidates,
      notListed: total - candidates.length,
    };

    if (!opts.dryRun) {
      for (let i = 0; i < candidates.length; i += BATCH) {
        if (outOfTime()) {
          report.notAttempted = candidates.length - i;
          break;
        }
        const ids = candidates.slice(i, i + BATCH).map((c) => c.id);
        const r = await runWithTenant({ tenantId: tenant.id, slug: tenant.slug }, () =>
          hardDeleteParentAccounts(ids, tenant.id, SYSTEM_ACTOR, {
            pendingOnly: true,
            // Re-checked inside each delete transaction: an account that was
            // edited, disabled, or started a dossier since the select above no
            // longer matches and is left alone. (For the OTHER responsable of
            // a family the check is as fresh as that transaction's first
            // statement, not later.)
            extraWhere: due,
          }),
        );
        report.deleted += r.processed;
        report.skipped += ids.length - r.processed;
      }
    }
    reports.push(report);
  }
  return reports;
}

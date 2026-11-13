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
 * nobody is ever deleted without having had `days` full days to act, and an
 * account is never deleted before a date it has on screen (the date SHOWN to
 * a family can still move earlier in one honest case: the campaign itself is
 * closed sooner, and the family's date is capped at that closing):
 *   1. the account's creation;
 *   2. the account's last modification (`User.updatedAt`) — which is also how
 *      "the family just lost its last dossier" is recorded: every code path
 *      that hard-deletes a dossier calls `restartSignupCountdownFor`;
 *   3. `Tenant.signupRetentionSince` — a ratchet that only ever moves forward:
 *      set when the school switches the rule on or changes the delay
 *      (`nextSignupRetentionSince`, which keeps every date already shown even
 *      when the delay is shortened), and pinned before any edit to a campaign
 *      that could otherwise pull the dates earlier (`keepSignupDeadlinesStable`);
 *   4. the opening of the admission campaign (the oldest cycle that is open
 *      right now).
 * While NO cycle is open a family cannot start a dossier at all, so the rule
 * is suspended: nothing is deleted and no deadline is shown.
 *
 * An account can also become eligible again WITHOUT being edited — it loses
 * its last dossier, its child link, or the student that confirmed it. Every
 * such code path calls `restartSignupCountdownFor` first, so the account gets
 * a fresh, full countdown instead of being due the same night.
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
  /**
   * When the open campaign(s) close: the latest closing date among the open
   * cycles, or null when at least one has no end. Past that instant the rule
   * is suspended and no dossier can be started — used for DISPLAY only (a
   * date beyond it would promise the family time it does not have).
   */
  lastClose: Date | null;
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
  openCycles: { openAt: Date; createdAt: Date; closeAt: Date | null }[],
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
  const lastClose = openCycles.some((c) => c.closeAt === null)
    ? null
    : new Date(Math.max(...openCycles.map((c) => c.closeAt!.getTime())));
  return {
    status: "active",
    window: { days, floor: new Date(Math.max(since, openSince)), lastClose },
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
    select: { openAt: true, createdAt: true, closeAt: true },
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
 * The date to show the FAMILY ("start a dossier before …"), or null when the
 * rule does not apply to this account (rule off or suspended, account
 * confirmed, disabled, created by the school, on a staff address, or its
 * family has a dossier).
 *
 * Capped at the campaign's closing date: after it no dossier can be started,
 * so a later date would promise time the family does not have. Showing an
 * EARLIER date than the real deletion is always safe.
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
  if (!row) return null;
  const deadline = signupDeadline(row, state.window);
  const { lastClose } = state.window;
  return lastClose && lastClose < deadline ? lastClose : deadline;
}

/**
 * Deletion dates for the Admissions "Comptes sans dossier" block: the accounts
 * in `userIds` the rule applies to AND whose countdown ends while a campaign
 * is still open. An account whose countdown outlasts the campaign is absent —
 * nothing is deleted once the campaign has closed, so announcing a date would
 * be untrue. `timeZone` is the school's, for formatting.
 */
export async function getSignupDeadlines(
  tenantId: string,
  userIds: string[],
  now: Date = new Date(),
): Promise<{ state: RetentionState; deadlines: Map<string, Date>; timeZone: string | null }> {
  const state = await getRetentionState(tenantId, now);
  const deadlines = new Map<string, Date>();
  if (state.status !== "active" || userIds.length === 0) {
    return { state, deadlines, timeZone: null };
  }
  const prisma = unscopedDb();
  const [rows, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [await eligibleWhere(tenantId), { id: { in: userIds } }] },
      select: { id: true, createdAt: true, updatedAt: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timeZone: true } }),
  ]);
  const { lastClose } = state.window;
  for (const r of rows) {
    const deadline = signupDeadline(r, state.window);
    // The delete happens at the first daily run at or after the deadline. If
    // the campaign has closed by then the rule is suspended and nothing is
    // deleted — so no date is announced.
    if (lastClose && lastClose < firstDailyRunAtOrAfter(deadline)) continue;
    deadlines.set(r.id, deadline);
  }
  return { state, deadlines, timeZone: tenant?.timeZone ?? null };
}

/** Hour (UTC) of the daily purge — keep in sync with "schedule" in vercel.json. */
const CRON_HOUR_UTC = 2;

/** Earliest instant the daily job can run at or after `d`. */
export function firstDailyRunAtOrAfter(d: Date): Date {
  const run = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CRON_HOUR_UTC),
  );
  if (run < d) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}

/**
 * `YYYY-MM-DD` of an instant in the school's time zone (UTC when the zone is
 * missing or unknown). A deletion happens at or after its deadline instant,
 * so the LOCAL day of the deadline is never later than the local day of the
 * deletion — "from <this day>" then holds in every zone.
 */
export function isoDayInZone(d: Date, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ── Keeping the dates honest ─────────────────────────────────────────────────

/**
 * The `signupRetentionSince` to store when the delay changes from `oldDays`
 * to `newDays` (null = off). Pure.
 *
 * It keeps one promise: an account that has a date on screen is never deleted
 * before it — not when the delay is shortened, not when the rule is switched
 * off and on again. H below is the latest date any family may currently be
 * looking at; the new `since` is the earliest instant that still honours it:
 *   - rule on:  H = `latestPromise` when the caller measured it (see
 *               `latestSignupPromise`: null = no account has a date, so
 *               H = now), otherwise the safe upper bound
 *               max(now, since) + oldDays
 *   - rule off: H = since (while the rule is off, the column holds H itself)
 *   - new since = max(now, H − newDays); switching off stores H.
 * `since` is one clock for the whole school, so shortening 60 → 7 while a
 * family holds a date makes EVERY account wait until that date, new sign-ups
 * included; the 7 days apply once it has passed (Settings says so). A first
 * switch-on, lengthening, or shortening while nobody has a date starts from
 * now.
 */
export function nextSignupRetentionSince(args: {
  now: Date;
  oldDays: number | null | undefined;
  oldSince: Date | null | undefined;
  newDays: number | null;
  /**
   * Latest deletion date an eligible account currently has; null when no
   * account has one; undefined when not measured (the upper bound is used).
   */
  latestPromise?: Date | null;
}): Date | null {
  const now = args.now.getTime();
  const wasOn = validDays(args.oldDays);
  const oldSince = args.oldSince?.getTime() ?? null;
  const upperBound = Math.max(now, oldSince ?? now) + (args.oldDays ?? 0) * DAY_MS;
  const measured =
    args.latestPromise === undefined
      ? upperBound
      : args.latestPromise === null
        ? now
        : // never above the bound: a measurement cannot promise more than the rule did
          Math.min(upperBound, Math.max(now, args.latestPromise.getTime()));
  const highWater = wasOn ? measured : oldSince;
  if (args.newDays === null) {
    // Off: remember H so a later switch-on cannot undercut it.
    return highWater === null ? null : new Date(highWater);
  }
  return new Date(Math.max(now, (highWater ?? now) - args.newDays * DAY_MS));
}

/**
 * The latest deletion date an eligible account of this tenant currently has,
 * for `nextSignupRetentionSince`:
 *   - null: no account is eligible, so nobody has a date on screen;
 *   - a Date: rule active — the furthest deadline among the eligible accounts;
 *   - undefined: rule off, or suspended while eligible accounts exist (dates
 *     were shown before the campaign closed and cannot be recomputed) — the
 *     caller falls back to the safe upper bound.
 * An account that is NOT eligible right now (it has a dossier, a linked
 * child…) is not counted: if it becomes eligible again later it gets a fresh,
 * full countdown and a fresh notice at that moment.
 */
export async function latestSignupPromise(
  tenantId: string,
  now: Date = new Date(),
): Promise<Date | null | undefined> {
  const state = await getRetentionState(tenantId, now);
  if (state.status === "off") return undefined;
  const agg = await unscopedDb().user.aggregate({
    where: await eligibleWhere(tenantId),
    _count: { _all: true },
    _max: { createdAt: true, updatedAt: true },
  });
  if (agg._count._all === 0) return null;
  if (state.status !== "active" || !agg._max.createdAt || !agg._max.updatedAt) return undefined;
  // max over accounts of max(createdAt, updatedAt, floor) + days
  return signupDeadline(
    { createdAt: agg._max.createdAt, updatedAt: agg._max.updatedAt },
    state.window,
  );
}

/**
 * What `signupRetentionSince` must be raised to BEFORE an admin edits a
 * campaign (its active flag or its dates), so the edit cannot pull any date
 * earlier. Pure.
 *   - rule active: pin the current floor. The floor is max(since, opening of
 *     the oldest open cycle); once `since` equals it, re-opening an older
 *     cycle or moving an opening date back can no longer lower it.
 *   - rule suspended (no campaign open): now. If the edit opens a campaign,
 *     every countdown starts from this moment, whatever its opening date says.
 *   - rule off: nothing.
 */
export function sincePinBeforeCycleEdit(state: RetentionState, now: Date): Date | null {
  if (state.status === "off") return null;
  return state.status === "active" ? state.window.floor : now;
}

/** Raise `signupRetentionSince` to `to` — never lowers it. No-op while the rule is off. */
async function raiseSignupRetentionSince(tenantId: string, to: Date): Promise<void> {
  await unscopedDb().tenant.updateMany({
    where: {
      id: tenantId,
      signupRetentionDays: { not: null },
      OR: [{ signupRetentionSince: null }, { signupRetentionSince: { lt: to } }],
    },
    data: { signupRetentionSince: to },
  });
}

/**
 * Wrap any admin write that can change which cycles are open or since when
 * (the campaign's active flag, its dates). The pin happens BEFORE the write
 * and nothing is needed after it, so a failure at any point can never leave
 * a campaign edited with the dates pulled earlier.
 */
export async function keepSignupDeadlinesStable<T>(
  tenantId: string,
  write: () => Promise<T>,
): Promise<T> {
  const now = new Date();
  const pin = sincePinBeforeCycleEdit(await getRetentionState(tenantId, now), now);
  if (pin) await raiseSignupRetentionSince(tenantId, pin);
  return write();
}

/**
 * To call BEFORE anything that can make an account eligible again without
 * editing it:
 *   - a dossier is HARD-deleted (a parent cancelling a draft, an admin
 *     emptying the trash or deleting a campaign);
 *   - a child link is removed, or the student that confirmed the family is
 *     deleted.
 * The given accounts and the other responsables of their families get a
 * fresh, full countdown. Without this, a family that had a dossier or a
 * linked child for months — and therefore never saw a deadline — would be due
 * the very night it disappears.
 *
 * Any new code path of that kind must call this too.
 * No-op while the rule is off (switching it on restarts everyone anyway).
 */
export async function restartSignupCountdownFor(
  tenantId: string,
  userIds: string[],
  now: Date = new Date(),
): Promise<void> {
  const ids = [...new Set(userIds)];
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
          ? {
              status: "active",
              window: { days: opts.daysOverride, floor: new Date(0), lastClose: null },
            }
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

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteAdminGrantsForEmail, staffIdentityGuard } from "@/lib/staff-identity";
import { deleteFromStorage } from "@/lib/storage";
import { PENDING_PARENT_WHERE } from "@/app/(app)/admin/parents/_pending";

/**
 * The one place a parent account is HARD deleted. Lives outside any
 * "use server" file on purpose: exporting it from one would expose it as a
 * public server action taking arbitrary ids / tenant / actor.
 *
 * Callers: the Parents console (trash "Supprimer définitivement", single and
 * bulk; the pending-accounts purge) and the automatic purge of abandoned
 * sign-ups (src/lib/signup-retention.ts).
 */

export type HardDeleteOutcome = {
  processed: number;
  skippedHasChildren: number;
  skippedHasDossier: number;
  skippedOther: number;
  /** Ids actually deleted, in processing order. */
  deletedIds: string[];
};

/**
 * Hard-delete parent accounts that have no linked child. Every hard delete
 * follows the same rules:
 *  - the caller has ALREADY authorised the action (`eleves:full` for a human,
 *    the cron secret for the system) and runs inside `runWithTenant` — the
 *    queries below use the tenant-scoped client;
 *  - the staff-identity guard is applied to every select: a non-admin actor
 *    (the system actor included) never reaches a staff hat or a staff-domain
 *    account;
 *  - `pendingOnly` additionally requires the PENDING predicate (purge view);
 *  - `extraWhere` narrows the set further and is re-checked INSIDE each
 *    transaction, so an account that stopped matching between the candidate
 *    select and the delete (e.g. it just started a dossier) is left alone;
 *  - an account with a linked child is skipped (orphaning a Student loses data);
 *  - an account with ANY non-DRAFT application is skipped — admissions owns it;
 *  - otherwise its DRAFT applications are deleted (documents cascade; files are
 *    removed from storage best-effort), then the User (Guardian, sessions,
 *    message threads cascade), then its admin grants; the Family created at
 *    sign-up is removed when nothing references it any more;
 *  - each account runs in its own transaction with a re-check, and a FK
 *    refusal (legacy rows) counts as skipped instead of aborting the batch.
 */
export async function hardDeleteParentAccounts(
  ids: string[],
  tenantId: string,
  user: { role: string },
  opts: { pendingOnly: boolean; extraWhere?: Prisma.UserWhereInput },
): Promise<HardDeleteOutcome> {
  const out: HardDeleteOutcome = {
    processed: 0,
    skippedHasChildren: 0,
    skippedHasDossier: 0,
    skippedOther: 0,
    deletedIds: [],
  };
  if (ids.length === 0) return out;

  const guard = (await staffIdentityGuard(user, tenantId)) as Prisma.UserWhereInput;
  const scope: Prisma.UserWhereInput[] = [{ role: "PARENT" }, guard];
  if (opts.pendingOnly) scope.push(PENDING_PARENT_WHERE);
  if (opts.extraWhere) scope.push(opts.extraWhere);
  const childless: Prisma.UserWhereInput = {
    OR: [{ guardianProfile: null }, { guardianProfile: { childLinks: { none: {} } } }],
  };

  const candidates = await db.user.findMany({
    where: { id: { in: ids }, AND: scope },
    select: {
      id: true,
      email: true,
      guardianProfile: {
        select: { familyId: true, _count: { select: { childLinks: true } } },
      },
      submittedApps: {
        select: { status: true, documents: { select: { storagePath: true } } },
      },
    },
  });
  out.skippedOther += ids.length - candidates.length;

  const purgedEmails: string[] = [];
  const orphanedPaths: string[] = [];

  for (const c of candidates) {
    if ((c.guardianProfile?._count.childLinks ?? 0) > 0) {
      out.skippedHasChildren++;
      continue;
    }
    if (c.submittedApps.some((a) => a.status !== "DRAFT")) {
      out.skippedHasDossier++;
      continue;
    }
    const familyId = c.guardianProfile?.familyId ?? null;
    const paths = c.submittedApps.flatMap((a) => a.documents.map((d) => d.storagePath));
    try {
      await db.$transaction(async (tx) => {
        // Re-check inside the transaction: a child link, a Dars id or a
        // submitted dossier may have appeared since the candidate select.
        const still = await tx.user.findFirst({
          where: { id: c.id, AND: [...scope, childless] },
          select: { id: true },
        });
        if (!still) throw new Error("state-changed");
        // Only DRAFT dossiers are ours to remove. One submitted in the
        // meantime survives this deleteMany and the RESTRICT FK on
        // Application.submittedBy makes the user delete fail → rollback.
        if (c.submittedApps.length > 0) {
          await tx.application.deleteMany({
            where: { submittedByUserId: c.id, status: "DRAFT" },
          });
        }
        await tx.user.delete({ where: { id: c.id } });
        if (familyId) {
          const guardians = await tx.guardian.count({ where: { familyId } });
          const students = await tx.student.count({ where: { familyId } });
          if (guardians === 0 && students === 0) {
            await tx.family.delete({ where: { id: familyId } });
          } else if (c.submittedApps.length > 0) {
            // The drafts went with the account. The family's other
            // responsables may now be "without a dossier": restart their
            // automatic-deletion countdown (src/lib/signup-retention.ts reads
            // updatedAt) so they are not due the same night.
            await tx.user.updateMany({
              where: { guardianProfile: { familyId } },
              data: { updatedAt: new Date() },
            });
          }
        }
      });
    } catch (e) {
      console.error(
        `[parents] hard delete skipped ${c.id}:`,
        e instanceof Error ? e.message : e,
      );
      out.skippedOther++;
      continue;
    }
    out.processed++;
    out.deletedIds.push(c.id);
    purgedEmails.push(c.email);
    orphanedPaths.push(...paths);
  }

  for (const email of purgedEmails) await deleteAdminGrantsForEmail(tenantId, email);
  // Storage cleanup is best-effort: the rows are already gone, an orphan
  // object in the bucket is acceptable, a failed toast is not.
  await Promise.all(
    orphanedPaths.map((p) =>
      deleteFromStorage(p).catch((e) => {
        console.error(
          `[parents] storage delete failed for ${p}:`,
          e instanceof Error ? e.message : e,
        );
      }),
    ),
  );
  return out;
}

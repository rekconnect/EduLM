/**
 * Family code generation + Guardian/Student family attachment.
 *
 * Each tenant has a counter (`Tenant.familyCodeNextSequence`) + format
 * (`familyCodePrefix`, `familyCodePadding`). New families pull the next
 * sequence atomically inside a transaction so concurrent parent creations
 * never collide on the unique `(tenantId, code)` constraint.
 */

import type { Prisma } from "@prisma/client";
import { unscopedDb } from "@/lib/db";
import {
  buildKidCode,
  nextKidIndex,
  readKidCode,
  withKidCode,
} from "@/lib/student-code";

/**
 * Assign a Dars-style child code (familyCode + 1-based sibling index) into the
 * student's customAnswers, unless it already has one. Idempotent and safe to
 * call after a student is placed in a family. Returns the resulting code.
 */
export async function assignKidCode(studentId: string): Promise<string | null> {
  const u = unscopedDb();
  const student = await u.student.findUnique({
    where: { id: studentId },
    select: {
      customAnswers: true,
      familyId: true,
      family: { select: { code: true } },
    },
  });
  if (!student) return null;
  const existing = readKidCode(student.customAnswers);
  if (existing) return existing; // never overwrite (imported or prior)
  if (!student.familyId || !student.family) return null;
  const siblings = await u.student.findMany({
    where: { familyId: student.familyId, NOT: { id: studentId } },
    select: { customAnswers: true },
  });
  const code = buildKidCode(
    student.family.code,
    nextKidIndex(student.family.code, siblings),
  );
  await u.student.update({
    where: { id: studentId },
    data: {
      customAnswers: withKidCode(
        student.customAnswers,
        code,
      ) as Prisma.InputJsonValue,
    },
  });
  return code;
}

/**
 * Format a sequence number into the tenant's configured code shape.
 * Pure helper — separated so admin previews ("next code will be F-0042")
 * can use it without writing anything.
 */
export function formatFamilyCode(
  prefix: string | null,
  padding: number,
  sequence: number,
): string {
  const padded = String(sequence).padStart(Math.max(padding, 0), "0");
  return `${prefix ?? "F-"}${padded}`;
}

/**
 * Atomically reserve the next code for a tenant and create the Family row.
 * Runs in a transaction so the counter increment + Family.create are a unit
 * — on any error the sequence rolls back. Returns the new family's id+code.
 */
export async function createFamily(
  tenantId: string,
  opts?: { name?: string | null },
): Promise<{ id: string; code: string }> {
  const u = unscopedDb();
  return u.$transaction(async (tx) => {
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { familyCodeNextSequence: { increment: 1 } },
      select: {
        familyCodePrefix: true,
        familyCodePadding: true,
        familyCodeNextSequence: true,
      },
    });
    // `increment` returns the post-update value; we want the value we just
    // consumed (one less).
    const seq = tenant.familyCodeNextSequence - 1;
    const code = formatFamilyCode(
      tenant.familyCodePrefix,
      tenant.familyCodePadding,
      seq,
    );
    const family = await tx.family.create({
      data: { tenantId, code, name: opts?.name ?? null },
      select: { id: true, code: true },
    });
    return family;
  });
}

/**
 * Ensure the given Guardian belongs to a Family. Returns the existing one if
 * already linked. Otherwise creates a new Family with auto-generated code and
 * links the Guardian + all of their currently-linked Students.
 */
export async function ensureFamilyForGuardian(
  guardianId: string,
  opts?: { name?: string | null },
): Promise<{ id: string; code: string }> {
  const u = unscopedDb();
  const guardian = await u.guardian.findUnique({
    where: { id: guardianId },
    select: {
      tenantId: true,
      family: { select: { id: true, code: true } },
      childLinks: { select: { studentId: true } },
    },
  });
  if (!guardian) throw new Error(`Guardian ${guardianId} not found`);
  if (guardian.family) return guardian.family;

  const family = await createFamily(guardian.tenantId, opts);
  await u.$transaction([
    u.guardian.update({
      where: { id: guardianId },
      data: { familyId: family.id },
    }),
    ...guardian.childLinks.map((cl) =>
      u.student.update({
        where: { id: cl.studentId },
        data: { familyId: family.id },
      }),
    ),
  ]);
  // Assign each newly-attached child its Dars-style code (sequentially so each
  // sees the previous one's index).
  for (const cl of guardian.childLinks) await assignKidCode(cl.studentId);
  return family;
}

/** Why a parent was left under their own code when linked to a child of another one. */
export type KeptReason =
  /** Their code also holds children or another parent. */
  | "shared-code"
  /** They are already linked to a child recorded under a third code. */
  | "children-elsewhere"
  /** They have a dossier in progress, whose address and consents live on their code. */
  | "open-dossier"
  /** Their code carries an address or image-rights answers. */
  | "household-data";

export type FamilyPlacement =
  /** Parent and child were already under the same code. */
  | { kind: "same"; code: string }
  /** The parent joined the child's code; `removedCode` is the emptied one. */
  | { kind: "moved"; code: string; removedCode: string | null }
  /** Both keep their code. */
  | { kind: "kept"; parentCode: string; childCode: string; reason: KeptReason }
  /** The child had no code and took the parent's. */
  | { kind: "child-placed"; code: string }
  | { kind: "not-found" };

/** Family columns that hold what a household told the school. */
const HOUSEHOLD_COLUMNS = [
  "addressStreet",
  "addressHood",
  "addressPostal",
  "addressCity",
  "addressCountry",
  "imageRightsSite",
  "imageRightsBook",
  "imageRightsSocial",
  "imageRightsRadio",
] as const;

/** A dossier the school has not decided yet. */
const OPEN_DOSSIER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INTERVIEW_SCHEDULED",
  "WAITLISTED",
] as const;

/**
 * Called once a parent is linked to a child: bring the two under one family
 * code when that is safe. The code is the school's ACCOUNTING unit — a child
 * has exactly one, and the people responsible for that child are recorded
 * under it (as in Dars, where a former wife stays under the father's code).
 *
 *  - The child has a code and the parent has none, or one that holds nothing
 *    but that parent: the parent JOINS the child's code and the emptied code
 *    is removed.
 *  - The parent is KEPT under their own code whenever something hangs on it
 *    (see `KeptReason`): other people, another child's code, a dossier in
 *    progress, an address. The link alone then ties them to this child.
 *  - The child has no code: it takes the parent's (created when the parent
 *    has none either) and gets its child code.
 *
 * Never changes the code of a child that already has one. The caller is told
 * what happened, to say it on screen: a move changes which family a parent is
 * shown and written to under.
 */
export async function placeGuardianWithStudent(
  guardianId: string,
  studentId: string,
  retry = true,
): Promise<FamilyPlacement> {
  const u = unscopedDb();
  const [guardian, student] = await Promise.all([
    u.guardian.findUnique({
      where: { id: guardianId },
      select: {
        tenantId: true,
        userId: true,
        familyId: true,
        family: { select: { code: true } },
      },
    }),
    u.student.findUnique({
      where: { id: studentId },
      select: {
        tenantId: true,
        familyId: true,
        family: { select: { code: true } },
      },
    }),
  ]);
  if (!guardian || !student || guardian.tenantId !== student.tenantId) {
    return { kind: "not-found" };
  }

  // The child has no code yet: it takes the parent's.
  if (!student.familyId || !student.family) {
    const family =
      guardian.familyId && guardian.family
        ? { id: guardian.familyId, code: guardian.family.code }
        : await createFamily(guardian.tenantId);
    if (!guardian.familyId) {
      await u.guardian.update({
        where: { id: guardianId },
        data: { familyId: family.id },
      });
    }
    // Only if it is still without a code: someone may have placed it since.
    const placed = await u.student.updateMany({
      where: { id: studentId, familyId: null },
      data: { familyId: family.id },
    });
    if (placed.count === 0) {
      return retry
        ? placeGuardianWithStudent(guardianId, studentId, false)
        : { kind: "not-found" };
    }
    await assignKidCode(studentId);
    return { kind: "child-placed", code: family.code };
  }

  const childCode = student.family.code;
  const childFamilyId = student.familyId;
  if (guardian.familyId === childFamilyId) {
    return { kind: "same", code: childCode };
  }
  const parentCode = guardian.family?.code ?? "";
  const kept = (reason: KeptReason): FamilyPlacement => ({
    kind: "kept",
    parentCode,
    childCode,
    reason,
  });

  // Already tied to a child of yet another code: this parent has children
  // under several codes and belongs to none of them more than the others.
  const otherLinks = await u.studentGuardian.findMany({
    where: { guardianId, NOT: { studentId } },
    select: { student: { select: { familyId: true } } },
  });
  if (
    otherLinks.some(
      (l) => l.student.familyId !== null && l.student.familyId !== childFamilyId,
    )
  ) {
    return kept("children-elsewhere");
  }

  // A dossier in progress reads and writes the address and the consents of
  // its author's family: moving the author would swap them under their feet.
  const openDossiers = await u.application.count({
    where: {
      submittedByUserId: guardian.userId,
      deletedAt: null,
      status: { in: [...OPEN_DOSSIER_STATUSES] },
    },
  });
  if (openDossiers > 0) return kept("open-dossier");

  const oldFamilyId = guardian.familyId;
  return u.$transaction(async (tx) => {
    if (oldFamilyId) {
      // Lock the code being left, so nobody joins it between the check and
      // its removal (a child being accepted into it, for instance).
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${oldFamilyId} FOR UPDATE`;
      const old = await tx.family.findUnique({
        where: { id: oldFamilyId },
        include: { _count: { select: { guardians: true, students: true } } },
      });
      if (old) {
        if (old._count.students > 0 || old._count.guardians > 1) {
          return kept("shared-code");
        }
        if (HOUSEHOLD_COLUMNS.some((k) => old[k] != null)) {
          return kept("household-data");
        }
      }
    }
    await tx.guardian.update({
      where: { id: guardianId },
      data: { familyId: childFamilyId },
    });
    if (oldFamilyId) {
      // Empty by the checks above, and nothing else references a family.
      await tx.family.deleteMany({ where: { id: oldFamilyId } });
    }
    return {
      kind: "moved" as const,
      code: childCode,
      removedCode: oldFamilyId ? parentCode : null,
    };
  });
}

/**
 * Take a parent out of the family code they sit under and give them a fresh
 * one of their own. The way back from a link that placed a parent under the
 * wrong family. Touches no child and no link.
 */
export async function giveGuardianOwnFamily(
  guardianId: string,
): Promise<{ id: string; code: string } | null> {
  const u = unscopedDb();
  const guardian = await u.guardian.findUnique({
    where: { id: guardianId },
    select: { tenantId: true },
  });
  if (!guardian) return null;
  const family = await createFamily(guardian.tenantId);
  await u.guardian.update({
    where: { id: guardianId },
    data: { familyId: family.id },
  });
  return family;
}

/**
 * Link a Student to its guardian's Family (creating one if needed). Used
 * during application acceptance when a new Student is created and we need to
 * place it in the submitting parent's family.
 */
export async function linkStudentToGuardianFamily(
  studentId: string,
  guardianId: string,
): Promise<{ id: string; code: string }> {
  const family = await ensureFamilyForGuardian(guardianId);
  await unscopedDb().student.update({
    where: { id: studentId },
    data: { familyId: family.id },
  });
  await assignKidCode(studentId);
  return family;
}

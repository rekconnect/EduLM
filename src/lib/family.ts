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

import { db } from "@/lib/db";
import { nextLevel } from "@/lib/levels";
import { applyDossierToStudent } from "@/app/(app)/admissions-admin/_apply-dossier";

/**
 * Dars-style automatic acceptance of RE-INSCRIPTIONS (Raed 2026-09-29:
 * "no need to re-accept every student manually, it's a waste of time for
 * 1070 students").
 *
 * Called right after a parent submits a renewal dossier, INSIDE the caller's
 * tenant context. When the campaign has `autoAcceptRenewals` on:
 *   - target class = the student's current level advanced by one
 *     (CE1 → CE2), first section under capacity (A, then B, …) — the same
 *     rule as the manual accept picker's suggestion;
 *   - runs the exact acceptance writes the manual path runs for renewals
 *     (enrollment upsert + dossier→fiche propagation + status ACCEPTED);
 *   - NEVER blocks the submit: any missing precondition (toggle off, new
 *     inscription, no target year, no free section, Terminale) simply leaves
 *     the dossier SUBMITTED for the normal manual review.
 *
 * New inscriptions are never auto-accepted — creating students/families
 * deserves a human eye.
 */
export const AUTO_ACCEPT_CLASS_CAPACITY = 25; // future tenant setting

export type AutoAcceptResult =
  | { accepted: true; className: string }
  | { accepted: false; reason: string };

export async function autoAcceptRenewalIfEnabled(
  applicationId: string,
  tenantId: string,
): Promise<AutoAcceptResult> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      cycle: { select: { targetYearLabel: true, autoAcceptRenewals: true } },
      submittedBy: { select: { id: true, email: true, name: true } },
      responsables: {
        select: { kind: true, customAnswers: true },
        orderBy: { order: "asc" },
      },
      contacts: {
        select: {
          kind: true,
          firstName: true,
          lastName: true,
          relation: true,
          phoneMobile: true,
          phoneHome: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!app) return { accepted: false, reason: "not-found" };
  if (!app.cycle.autoAcceptRenewals) return { accepted: false, reason: "toggle-off" };
  if (!app.existingStudentId) return { accepted: false, reason: "not-a-renewal" };
  if (app.status !== "SUBMITTED") return { accepted: false, reason: "not-submitted" };

  // ── Target class: advance one level, first section under capacity ──
  const activeEnrollment = await db.enrollment.findFirst({
    where: {
      studentId: app.existingStudentId,
      academicYear: { isActive: true },
    },
    select: { class: { select: { level: true } } },
  });
  if (!activeEnrollment) return { accepted: false, reason: "no-current-enrollment" };
  const targetLevel = nextLevel(activeEnrollment.class.level);
  if (!targetLevel) return { accepted: false, reason: "graduating" }; // Terminale

  const targetClasses = await db.class.findMany({
    where: {
      academicYear: { label: app.cycle.targetYearLabel },
      level: targetLevel,
    },
    orderBy: { section: "asc" },
    select: {
      id: true,
      name: true,
      academicYearId: true,
      _count: { select: { enrollments: true } },
    },
  });
  const klass = targetClasses.find(
    (c) => c._count.enrollments < AUTO_ACCEPT_CLASS_CAPACITY,
  );
  if (!klass) {
    return {
      accepted: false,
      reason: targetClasses.length === 0 ? "no-target-classes" : "all-sections-full",
    };
  }

  // Image rights live on the family (feed the per-year auth_* keys).
  const guardian = await db.guardian.findUnique({
    where: { userId: app.submittedByUserId },
    select: {
      family: {
        select: {
          imageRightsSite: true,
          imageRightsBook: true,
          imageRightsSocial: true,
          imageRightsRadio: true,
        },
      },
    },
  });
  const fam = guardian?.family ?? null;

  const now = new Date();
  const studentId = app.existingStudentId;
  await db.$transaction(async (tx) => {
    await tx.enrollment.upsert({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId: klass.academicYearId,
        },
      },
      update: { classId: klass.id },
      create: {
        tenantId,
        studentId,
        classId: klass.id,
        academicYearId: klass.academicYearId,
      },
    });

    await applyDossierToStudent(
      tx as unknown as Parameters<typeof applyDossierToStudent>[0],
      {
        tenantId,
        studentId,
        yearLabel: app.cycle.targetYearLabel,
        dossierAnswers: app.dossierAnswers,
        studentAnswers: app.studentAnswers,
        parentAnswers: app.parentAnswers,
        submittedByUserId: app.submittedByUserId,
        submitterEmail: app.submittedBy.email,
        contacts: app.contacts,
        childPlaceOfBirthAr: app.childPlaceOfBirthAr,
        childCivil: {
          birthCountry: app.childBirthCountry,
          placeOfBirth: app.childPlaceOfBirth,
          nationality: app.childNationality,
          nationality2: app.childNationality2,
          firstNameAr: app.childFirstNameAr,
          lastNameAr: app.childLastNameAr,
          passportLebanese: app.childPassportLebanese,
          isLebanese: app.childIsLebanese,
        },
        responsables: app.responsables,
        imageRights: fam
          ? {
              site: fam.imageRightsSite,
              book: fam.imageRightsBook,
              social: fam.imageRightsSocial,
              radio: fam.imageRightsRadio,
            }
          : undefined,
        inscriptionDate: now.toISOString().slice(0, 10),
      },
    );

    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "ACCEPTED",
        decisionAt: now,
        decisionNote: `Réinscription acceptée automatiquement → ${klass.name}`,
        reviewedAt: now,
        // No human reviewer — the campaign's auto-accept setting decided.
        reviewedByUserId: null,
        resultingStudentId: null,
      },
    });
  });

  return { accepted: true, className: klass.name };
}

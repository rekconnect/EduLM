"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { joinName } from "@/lib/names";
import { loadEntityFieldsConfig } from "../../../settings/_actions";

/**
 * Save one parent's fiche fields, in place. Routes each value to its home:
 *   userBoundTo     → User column (firstName/lastName/email → name derived)
 *   guardianBoundTo → Guardian column (phone, nationality1/2)
 *   familyBoundTo   → Family column (address, image rights)
 *   else            → User.customAnswers[key]
 * So editing canonical + custom fields together "just works" from the fiche.
 */
export async function saveGuardianFiche(
  userId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole("SCHOOL_ADMIN");
  const tenantId = admin.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const config = await loadEntityFieldsConfig("parent");
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        customAnswers: true,
        guardianProfile: { select: { id: true, familyId: true } },
      },
    });
    if (!user) return { ok: false, error: "not-found" };

    const answers: Record<string, unknown> =
      user.customAnswers && typeof user.customAnswers === "object"
        ? { ...(user.customAnswers as Record<string, unknown>) }
        : {};
    const userData: Record<string, unknown> = {};
    const guardianData: Record<string, unknown> = {};
    const familyData: Record<string, unknown> = {};

    const toBool = (v: string) =>
      v === "yes" || v === "Oui" || v === "true"
        ? true
        : v === "no" || v === "Non" || v === "false"
          ? false
          : null;

    for (const f of config.fields) {
      if (!(f.key in values)) continue;
      const v = (values[f.key] ?? "").trim();
      if (f.userBoundTo === "firstName") userData.firstName = v || null;
      else if (f.userBoundTo === "lastName") userData.lastName = v || null;
      else if (f.userBoundTo === "email") {
        if (v) userData.email = v.toLowerCase();
      } else if (f.guardianBoundTo === "phone") guardianData.phone = v || null;
      else if (f.guardianBoundTo === "nationality1") guardianData.nationality1 = v || null;
      else if (f.guardianBoundTo === "nationality2") guardianData.nationality2 = v || null;
      else if (f.familyBoundTo === "addressStreet") familyData.addressStreet = v || null;
      else if (f.familyBoundTo === "addressHood") familyData.addressHood = v || null;
      else if (f.familyBoundTo === "addressCity") familyData.addressCity = v || null;
      else if (f.familyBoundTo === "addressCountry") familyData.addressCountry = v || null;
      else if (f.familyBoundTo === "imageRightsSite") familyData.imageRightsSite = toBool(v);
      else if (f.familyBoundTo === "imageRightsBook") familyData.imageRightsBook = toBool(v);
      else if (f.familyBoundTo === "imageRightsSocial") familyData.imageRightsSocial = toBool(v);
      else if (f.familyBoundTo === "imageRightsRadio") familyData.imageRightsRadio = toBool(v);
      else answers[f.key] = v;
    }

    // Recompute display name from the final first/last.
    if (userData.firstName !== undefined || userData.lastName !== undefined) {
      const first = (userData.firstName as string | null) ?? user.firstName;
      const last = (userData.lastName as string | null) ?? user.lastName;
      userData.name = joinName(first ?? "", last ?? "");
    }

    await db.user.update({
      where: { id: userId },
      data: { ...userData, customAnswers: answers },
    });
    if (Object.keys(guardianData).length && user.guardianProfile) {
      await db.guardian.update({
        where: { id: user.guardianProfile.id },
        data: guardianData,
      });
    }
    if (Object.keys(familyData).length && user.guardianProfile?.familyId) {
      await db.family.update({
        where: { id: user.guardianProfile.familyId },
        data: familyData,
      });
    }

    revalidatePath(`/admin/parents/${userId}`);
    return { ok: true };
  });
}

/**
 * Save one child's fiche fields (all custom answers — the canonical
 * identity stays on the dossier). Merges into Student.customAnswers.
 */
export async function saveStudentFiche(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole("SCHOOL_ADMIN");
  const tenantId = admin.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const answers: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};
    for (const [k, v] of Object.entries(values)) answers[k] = (v ?? "").trim();
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
    // Family fiche lives under /admin/parents/[id]; revalidate the section.
    revalidatePath("/admin/parents", "layout");
    return { ok: true };
  });
}

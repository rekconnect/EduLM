"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { joinName } from "@/lib/names";
import { householdAnswerFields, storedAnswer } from "@/lib/entity-fields";
import { isStaffDomainEmail, moveAdminGrantEmail, staffDomainsFor, staffIdentityGuard } from "@/lib/staff-identity";
import { loadEntityFieldsConfig } from "../../../settings/_actions";

const asAnswers = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};

/**
 * Save one parent's fiche fields, in place. Routes each value to its home:
 *   userBoundTo     → User column (firstName/lastName/email → name derived)
 *   guardianBoundTo → Guardian column (phone, nationality1/2)
 *   familyBoundTo   → Family column (address, image rights)
 *   else            → User.customAnswers, MERGED into what is stored
 * So editing canonical + custom fields together "just works" from the fiche.
 *
 * `values` is keyed by field KEY (the fiche's pencils, which send their whole
 * group) or, with `keyedBy: "id"`, by field ID (the edit tabs, which send only
 * what changed). By id each value reaches exactly the field it was typed in,
 * even when two fields of the config share a key.
 *
 * Household answers (building, floor, caza… — see `householdAnswerFields`) are
 * the family's, yet each responsable stores a copy. When such a value CHANGES
 * it is written to every guardian of the family, so the copies stay identical
 * whichever parent a screen or a form reads. A value that was sent but not
 * changed is left alone on the other guardians.
 */
export async function saveGuardianFiche(
  userId: string,
  values: Record<string, string>,
  opts?: { keyedBy?: "key" | "id" },
): Promise<{ ok: boolean; error?: string }> {
  const { user: admin } = await requireModuleAccess("eleves", "write");
  const tenantId = admin.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const byId = opts?.keyedBy === "id";
  const sent = asAnswers(values);

  return runWithTenant({ tenantId, slug: null }, async () => {
    const config = await loadEntityFieldsConfig("parent");
    // PARENT accounts only — and, for non-admins, never a parent wearing a
    // staff hat (re-mailing it would re-key a staff identity).
    const user = await db.user.findFirst({
      where: { id: userId, role: "PARENT", ...(await staffIdentityGuard(admin, tenantId)) },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        customAnswers: true,
        guardianProfile: { select: { id: true, familyId: true } },
      },
    });
    if (!user) return { ok: false, error: "not-found" };

    const stored = asAnswers(user.customAnswers);
    const answers: Record<string, unknown> = { ...stored };
    const userData: Record<string, unknown> = {};
    const guardianData: Record<string, unknown> = {};
    const familyData: Record<string, unknown> = {};
    // Household answers this save actually changes: [storage slots, new value].
    const householdIds = new Set(householdAnswerFields(config).map((f) => f.id));
    const shared: Array<[string[], string]> = [];
    let matched = 0;
    // Nothing forbids two fields with the same label, hence the same key.
    const keyUses = new Map<string, number>();
    for (const f of config.fields) {
      keyUses.set(f.key, (keyUses.get(f.key) ?? 0) + 1);
    }

    const toBool = (v: string) =>
      v === "yes" || v === "Oui" || v === "true"
        ? true
        : v === "no" || v === "Non" || v === "false"
          ? false
          : null;

    for (const f of config.fields) {
      const name = byId ? f.id : f.key;
      if (!Object.prototype.hasOwnProperty.call(sent, name)) continue;
      matched++;
      const raw = sent[name];
      const v = typeof raw === "string" ? raw.trim() : "";
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
      else {
        // Stored under both slots: the fiche and the import read the key, the
        // inscription forms read the id (they only differ for fields created
        // in Settings). When several fields share the key, only the slot the
        // caller named is written: the other one may belong to another field.
        const ambiguous = (keyUses.get(f.key) ?? 0) > 1;
        const slots = ambiguous
          ? [byId ? f.id : f.key]
          : f.id === f.key
            ? [f.key]
            : [f.key, f.id];
        // A value named by a key that several fields share cannot be tied to
        // the household field: it stays on this parent.
        if (
          householdIds.has(f.id) &&
          !(ambiguous && !byId) &&
          v !== storedAnswer(stored, f).trim()
        ) {
          shared.push([slots, v]);
        }
        for (const slot of slots) answers[slot] = v;
      }
    }

    // The edit tabs name each field by id: one that no longer exists (deleted
    // or re-created in Settings while the page was open) would otherwise be
    // skipped while the save still reports success.
    if (byId && matched !== Object.keys(sent).length) {
      return { ok: false, error: "unknown-field" };
    }

    // A household value needs a household to live on. Refuse up front rather
    // than report success while silently dropping it (nothing is written).
    const familyId = user.guardianProfile?.familyId ?? null;
    if (Object.keys(familyData).length && !familyId) {
      return { ok: false, error: "no-family" };
    }

    // E-mail is the login identifier: same-tenant uniqueness, and a staff
    // address is an admin-only decision (double-profil trust anchor).
    const emailChanged =
      typeof userData.email === "string" && userData.email !== user.email;
    if (emailChanged) {
      const nextEmail = userData.email as string;
      if (
        admin.role !== "SCHOOL_ADMIN" &&
        isStaffDomainEmail(nextEmail, await staffDomainsFor(tenantId))
      ) {
        return { ok: false, error: "staff-domain" };
      }
      const clash = await db.user.findFirst({
        where: { email: nextEmail, NOT: { id: userId } },
        select: { id: true },
      });
      if (clash) return { ok: false, error: "email-taken" };
    }

    // Recompute display name from the final first/last.
    if (userData.firstName !== undefined || userData.lastName !== undefined) {
      const first = (userData.firstName as string | null) ?? user.firstName;
      const last = (userData.lastName as string | null) ?? user.lastName;
      userData.name = joinName(first ?? "", last ?? "");
    }

    // One transaction: either the whole save lands — this parent, the family
    // row and the other guardians' copy of the household answers — or none of
    // it does. Only `tx` inside: a second connection would wait on this one.
    const guardianProfile = user.guardianProfile;
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { ...userData, customAnswers: answers },
      });
      if (Object.keys(guardianData).length) {
        if (guardianProfile) {
          await tx.guardian.update({
            where: { id: guardianProfile.id },
            data: guardianData,
          });
        } else {
          // No Guardian row yet (account created without one): create it, as
          // updateParentIdentity does, instead of dropping the value.
          await tx.guardian.create({
            data: { tenantId, userId, ...guardianData },
          });
        }
      }
      if (Object.keys(familyData).length && familyId) {
        await tx.family.update({ where: { id: familyId }, data: familyData });
      }
      if (shared.length && familyId) {
        // Every other guardian of the family, whatever the state of the
        // account (the screens read the first guardian without filtering
        // either). No staff-identity guard here on purpose: only household
        // answers are written — never a login, an identity column or a
        // Guardian column — and the same operator already edits this
        // family's address through the Family row.
        const others = await tx.user.findMany({
          where: {
            role: "PARENT",
            id: { not: userId },
            guardianProfile: { familyId },
          },
          select: { id: true, customAnswers: true },
        });
        for (const other of others) {
          // Read just above, patched key by key: the rest of that parent's
          // answers is written back untouched.
          const next: Record<string, unknown> = { ...asAnswers(other.customAnswers) };
          for (const [slots, v] of shared) {
            for (const slot of slots) next[slot] = v;
          }
          await tx.user.updateMany({
            where: { id: other.id, role: "PARENT" },
            data: { customAnswers: next as Prisma.InputJsonValue },
          });
        }
      }
    });
    if (emailChanged) {
      await moveAdminGrantEmail(tenantId, user.email, userData.email as string);
    }

    revalidatePath(`/admin/parents/${userId}`);
    // Household values show on every guardian's page of the family.
    if (shared.length || Object.keys(familyData).length) {
      revalidatePath("/admin/parents", "layout");
    }
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
  const { user: admin } = await requireModuleAccess("eleves", "write");
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

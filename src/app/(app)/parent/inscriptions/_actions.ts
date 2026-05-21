"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "@/lib/entity-fields";

const dossierSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycleId: z.string().trim().min(1),
  establishmentId: z.string().trim().min(1).optional(),
  niveau: z.string().trim().min(1).max(40),
});

export type DossierFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

/**
 * Creates a new draft Application from the quick "Créer un dossier" form on
 * the parent dashboard. Captures the structural info (child name + DOB,
 * cycle, Établissement, niveau) up front. The full tenant-configured field
 * collection happens in the wizard step that follows.
 *
 * On success: redirects to /parent/applications/[id]/edit?step=1 so the
 * parent immediately starts filling the rest of the dossier.
 */
export async function createDossier(
  _prev: DossierFormState,
  formData: FormData,
): Promise<DossierFormState> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = dossierSchema.safeParse({
    childFirstName: String(formData.get("childFirstName") ?? ""),
    childLastName: String(formData.get("childLastName") ?? ""),
    childDob: String(formData.get("childDob") ?? ""),
    cycleId: String(formData.get("cycleId") ?? ""),
    establishmentId: String(formData.get("establishmentId") ?? "") || undefined,
    niveau: String(formData.get("niveau") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  // Parse the quick-form's extra student answers (admin-configured fields
  // with showOnDossierCreate). Filter against the tenant's student field
  // config so the parent can't smuggle in arbitrary keys.
  let extraAnswers: Record<string, string> = {};
  try {
    const raw = String(formData.get("extraStudentAnswers") ?? "{}");
    const parsedExtras = JSON.parse(raw);
    if (parsedExtras && typeof parsedExtras === "object") {
      const tenantConfig = await unscopedDb().tenant.findUnique({
        where: { id: tenantId },
        select: { studentFieldsConfig: true },
      });
      const config = parseEntityFieldsConfig(tenantConfig?.studentFieldsConfig);
      const validIds = new Set(
        config.fields.filter((f) => f.showOnDossierCreate).map((f) => f.id),
      );
      for (const [k, v] of Object.entries(parsedExtras as Record<string, unknown>)) {
        if (!validIds.has(k)) continue;
        if (typeof v !== "string") continue;
        const value = v.trim();
        if (value.length === 0) continue;
        if (value.length > 2000) continue;
        extraAnswers[k] = value;
      }
    }
  } catch {
    // Malformed extras → just ignore them. The parent can re-enter on the
    // full edit page.
    extraAnswers = {};
  }

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // Validate cycle is still open + within this tenant.
    const cycle = await db.admissionCycle.findUnique({
      where: { id: parsed.data.cycleId },
      select: { id: true, isActive: true, closeAt: true },
    });
    if (!cycle) return;
    if (!cycle.isActive) return;
    if (cycle.closeAt && cycle.closeAt < new Date()) return;

    // Validate Establishment belongs to this tenant.
    if (parsed.data.establishmentId) {
      const est = await db.establishment.findUnique({
        where: { id: parsed.data.establishmentId },
        select: { id: true },
      });
      if (!est) return;
    }

    // We DON'T fetch primary parent info here — the parent will fill it in
    // the subsequent wizard step. Required column `primaryParentName` is
    // seeded with the parent's display name to keep the schema happy; admin
    // sees the live values after the parent saves step 2.
    const created = await db.application.create({
      data: {
        tenantId,
        cycleId: parsed.data.cycleId,
        submittedByUserId: user.id,
        childFirstName: parsed.data.childFirstName,
        childLastName: parsed.data.childLastName,
        childDob: new Date(`${parsed.data.childDob}T00:00:00.000Z`),
        primaryParentName: user.name ?? user.email,
        primaryParentEmail: user.email,
        establishmentId: parsed.data.establishmentId ?? null,
        niveau: parsed.data.niveau,
        // Legacy column still expected by the existing wizard's level dropdown.
        requestedLevel: parsed.data.niveau,
        // Pre-populate studentAnswers with the quick-form extras so they're
        // immediately visible on the dossier edit page.
        studentAnswers: extraAnswers,
        status: "DRAFT",
      },
      select: { id: true },
    });
    newId = created.id;
  });

  if (!newId) return { formError: "create-failed" };
  revalidatePath("/parent/applications");
  revalidatePath("/parent/dashboard");
  // Land in the new tenant-fields wizard, not the legacy hardcoded one.
  redirect(`/parent/inscriptions/${newId}/edit`);
}

// ── Edit dossier core fields (name, DOB, scolarité) ──────────

const dossierCoreSchema = z.object({
  childFirstName: z.string().trim().min(1).max(80),
  childLastName: z.string().trim().min(1).max(80),
  childDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  establishmentId: z.string().trim().min(1).optional(),
  niveau: z.string().trim().min(1).max(40),
});

/**
 * Update the core dossier fields that were captured during creation. Parent
 * can correct a typo in the kid's name, switch the niveau choice, etc. —
 * without having to cancel and re-create the file.
 */
export async function updateDossierCore(
  applicationId: string,
  _prev: { ok?: boolean; error?: string; errors?: Record<string, string> } | undefined,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; errors?: Record<string, string> }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const parsed = dossierCoreSchema.safeParse({
    childFirstName: String(formData.get("childFirstName") ?? ""),
    childLastName: String(formData.get("childLastName") ?? ""),
    childDob: String(formData.get("childDob") ?? ""),
    establishmentId: String(formData.get("establishmentId") ?? "") || undefined,
    niveau: String(formData.get("niveau") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { ok: false, errors };
  }

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    if (parsed.data.establishmentId) {
      const est = await db.establishment.findUnique({
        where: { id: parsed.data.establishmentId },
        select: { id: true },
      });
      if (!est) return { ok: false, error: "establishment-not-found" };
    }

    await db.application.update({
      where: { id: applicationId },
      data: {
        childFirstName: parsed.data.childFirstName,
        childLastName: parsed.data.childLastName,
        childDob: new Date(`${parsed.data.childDob}T00:00:00.000Z`),
        establishmentId: parsed.data.establishmentId ?? null,
        niveau: parsed.data.niveau,
        requestedLevel: parsed.data.niveau, // keep legacy column in sync
      },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    revalidatePath("/parent/dashboard");
    return { ok: true };
  });
}

// ── Save tenant custom answers on the dossier (Round 8) ──────

/**
 * Collects every `f-<fieldId>` form entry, validates against the tenant's
 * field config (drops unknown ids), and writes to the requested column.
 * Used by both the parent + student sections on the dossier edit page.
 */
async function saveAnswers(
  applicationId: string,
  formData: FormData,
  entity: "parent" | "student",
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  // Verify the application belongs to this parent + load the right field
  // config for this entity in one tenant-scoped roundtrip.
  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, submittedByUserId: true, status: true },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT" && app.status !== "SUBMITTED") {
      return { ok: false, error: "locked" };
    }

    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: {
        parentFieldsConfig: entity === "parent",
        studentFieldsConfig: entity === "student",
      },
    });
    const config: EntityFieldsConfig = parseEntityFieldsConfig(
      entity === "parent"
        ? tenant?.parentFieldsConfig
        : tenant?.studentFieldsConfig,
    );
    const validIds = new Set(config.fields.map((f) => f.id));

    const answers: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (!k.startsWith("f-")) continue;
      const fieldId = k.slice(2);
      if (!validIds.has(fieldId)) continue;
      const value = String(v).trim();
      if (value.length === 0) continue;
      if (value.length > 2000) continue;
      answers[fieldId] = value;
    }

    await db.application.update({
      where: { id: applicationId },
      data:
        entity === "parent"
          ? { parentAnswers: answers }
          : { studentAnswers: answers },
    });
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

export async function saveDossierParentAnswers(
  applicationId: string,
  formData: FormData,
) {
  return saveAnswers(applicationId, formData, "parent");
}

export async function saveDossierStudentAnswers(
  applicationId: string,
  formData: FormData,
) {
  return saveAnswers(applicationId, formData, "student");
}

// ── Submit dossier — validates required tenant fields (Round 8) ──────

export async function submitDossier(
  applicationId: string,
): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const user = await requireRole("PARENT");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        submittedByUserId: true,
        status: true,
        parentAnswers: true,
        studentAnswers: true,
      },
    });
    if (!app) return { ok: false, error: "not-found" };
    if (app.submittedByUserId !== user.id) return { ok: false, error: "forbidden" };
    if (app.status !== "DRAFT") return { ok: false, error: "already-submitted" };

    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { parentFieldsConfig: true, studentFieldsConfig: true },
    });
    const parentConfig: EntityFieldsConfig = parseEntityFieldsConfig(
      tenant?.parentFieldsConfig,
    );
    const studentConfig: EntityFieldsConfig = parseEntityFieldsConfig(
      tenant?.studentFieldsConfig,
    );

    const parentAns = (app.parentAnswers ?? {}) as Record<string, string>;
    const studentAns = (app.studentAnswers ?? {}) as Record<string, string>;

    // Collect labels of required fields the parent left empty. Hidden-by-
    // showIf fields don't count; if the gate condition isn't met, they
    // aren't required.
    const missing: string[] = [];
    for (const f of parentConfig.fields) {
      if (!f.required) continue;
      if (f.showIf && parentAns[f.showIf.fieldId] !== f.showIf.equals) continue;
      if ((parentAns[f.id] ?? "").trim() === "") missing.push(f.label);
    }
    for (const f of studentConfig.fields) {
      if (!f.required) continue;
      if (f.showIf && studentAns[f.showIf.fieldId] !== f.showIf.equals) continue;
      if ((studentAns[f.id] ?? "").trim() === "") missing.push(f.label);
    }

    if (missing.length > 0) {
      return { ok: false, error: "missing-required", missing };
    }

    await db.application.update({
      where: { id: applicationId },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    revalidatePath("/parent/dashboard");
    revalidatePath(`/parent/inscriptions/${applicationId}/edit`);
    return { ok: true };
  });
}

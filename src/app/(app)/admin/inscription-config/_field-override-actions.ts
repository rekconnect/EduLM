"use server";

/**
 * Server actions for the WYSIWYG inscription-form editor at
 * /admin/inscription-config/preview. The editor's right-side drawer
 * dispatches one of these on Save / Réinitialiser:
 *
 *   saveFieldOverride(fieldKey, override)  — upserts the diverging keys
 *   resetFieldOverride(fieldKey)           — drops the key entirely
 *
 * Both touch `Tenant.inscriptionFormConfig` (one JSON column on the
 * tenant row) and revalidate every path that renders parent dossier
 * forms so a label edit shows up immediately for any parent currently
 * filling their inscription.
 *
 * Phase 5: every successful write also appends a row to
 * `TenantConfigAuditLog` capturing the previous + new values, the
 * acting admin, and a server timestamp. No UI consumes the log yet —
 * it's data first so we don't lose history while we build the viewer.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  applyFieldOverride,
  parseTenantInscriptionFormConfig,
  resetFieldOverride as resetFieldOverrideHelper,
  type FieldOverride,
} from "@/lib/inscription-fields-resolver";
import { INSCRIPTION_FIELDS_REGISTRY } from "@/lib/inscription-fields-registry";

const localeLabelSchema = z
  .object({
    fr: z.string().max(200).optional(),
    en: z.string().max(200).optional(),
    ar: z.string().max(200).optional(),
  })
  .optional();

const overridePayloadSchema = z.object({
  label: localeLabelSchema,
  required: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

export type FieldOverrideResult = {
  ok: boolean;
  error?: string;
};

/**
 * Save (upsert) the diverging values for `fieldKey` into the tenant's
 * inscriptionFormConfig. Values that match the registry default are
 * stripped before write; if the resulting override is empty, the key
 * is removed entirely (same effect as a reset).
 */
export async function saveFieldOverride(
  fieldKey: string,
  raw: unknown,
): Promise<FieldOverrideResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  // Guard: only let admin edit keys that actually exist in the
  // registry. Otherwise a stale UI / typo could persist orphaned
  // entries in the JSON that the resolver later ignores.
  if (!(fieldKey in INSCRIPTION_FIELDS_REGISTRY)) {
    return { ok: false, error: "unknown-field" };
  }

  const parsed = overridePayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation" };
  const override: FieldOverride = parsed.data;

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { inscriptionFormConfig: true },
  });
  if (!tenant) return { ok: false, error: "tenant-not-found" };

  const current = parseTenantInscriptionFormConfig(tenant.inscriptionFormConfig);
  const previousValue = current.fields[fieldKey] ?? null;
  const next = applyFieldOverride(current, fieldKey, override);
  const newValue = next.fields[fieldKey] ?? null;

  await unscopedDb().tenant.update({
    where: { id: tenantId },
    data: { inscriptionFormConfig: next as unknown as object },
  });

  // Append-only audit row. Best-effort — a failure here shouldn't
  // roll back the override write (data is already in inscriptionFormConfig).
  try {
    await unscopedDb().tenantConfigAuditLog.create({
      data: {
        tenantId,
        userId: user.id,
        fieldKey,
        action: "SET",
        previousValue: previousValue as unknown as object | undefined,
        newValue: newValue as unknown as object | undefined,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[inscription-form] audit log write failed:", e);
  }

  // Invalidate every path that renders dossier forms — parent dossier
  // shells, admin admission detail (if it ever consumes the override
  // metadata), and the preview itself.
  revalidatePath("/parent/inscriptions", "layout");
  revalidatePath("/admin/inscription-config/preview");
  return { ok: true };
}

/**
 * Drop the override for `fieldKey` from inscriptionFormConfig. No-op
 * if the key was never set. Returns ok either way so the UI can show
 * a confirming toast.
 */
export async function resetFieldOverride(
  fieldKey: string,
): Promise<FieldOverrideResult> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  if (!(fieldKey in INSCRIPTION_FIELDS_REGISTRY)) {
    return { ok: false, error: "unknown-field" };
  }

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { inscriptionFormConfig: true },
  });
  if (!tenant) return { ok: false, error: "tenant-not-found" };

  const current = parseTenantInscriptionFormConfig(tenant.inscriptionFormConfig);
  const previousValue = current.fields[fieldKey] ?? null;
  // No-op early-return when there's nothing to reset — skip the audit
  // row so the log doesn't fill with no-changes.
  if (previousValue === null) {
    return { ok: true };
  }
  const next = resetFieldOverrideHelper(current, fieldKey);

  await unscopedDb().tenant.update({
    where: { id: tenantId },
    data: { inscriptionFormConfig: next as unknown as object },
  });

  try {
    await unscopedDb().tenantConfigAuditLog.create({
      data: {
        tenantId,
        userId: user.id,
        fieldKey,
        action: "RESET",
        previousValue: previousValue as unknown as object | undefined,
        newValue: null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[inscription-form] audit log write failed:", e);
  }

  revalidatePath("/parent/inscriptions", "layout");
  revalidatePath("/admin/inscription-config/preview");
  return { ok: true };
}

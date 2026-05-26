"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { DOSSIER_TABS, parseTabsConfig } from "@/lib/dossier-tabs";

const tabsConfigSchema = z.object({
  eleve: z.boolean(),
  responsables: z.boolean(),
  foyer: z.boolean(),
  scolarite: z.boolean(),
  sante: z.boolean(),
  transport: z.boolean(),
  contacts: z.boolean(),
  finance: z.boolean(),
  justificatifs: z.boolean(),
  validation: z.boolean(),
});

/**
 * Save the per-tenant visibility config for the dossier's 10 tabs.
 * Élève, Responsables, and Validation are always rendered as visible
 * by the parent flow even when set to false, since dropping them
 * would break the inscription. We still persist the bool so admin
 * intent is recorded, and a future Phase 5+ may surface a warning.
 */
export async function updateInscriptionTabsConfig(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return { ok: false, error: "no-tenant" };

  const raw: Record<string, boolean> = {};
  for (const tab of DOSSIER_TABS) {
    raw[tab] = formData.get(`tab-${tab}`) === "on";
  }
  const parsed = tabsConfigSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation" };

  await unscopedDb().tenant.update({
    where: { id: user.tenantId },
    // Casting through `any` because the Json column type doesn't
    // accept Record<string, boolean> directly even though it's
    // serializable.
    data: { inscriptionTabsConfig: parsed.data as never },
  });
  revalidatePath("/admin/inscription-config");
  revalidatePath("/parent/inscriptions");
  return { ok: true };
}

/**
 * Load the current visibility config for the admin form. Falls back
 * to defaults (Montaigne baseline) when the tenant hasn't saved
 * anything yet.
 */
export async function loadInscriptionTabsConfig() {
  const user = await requireRole("SCHOOL_ADMIN");
  if (!user.tenantId) return parseTabsConfig(null);

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: user.tenantId },
    select: { inscriptionTabsConfig: true },
  });
  return parseTabsConfig(tenant?.inscriptionTabsConfig);
}

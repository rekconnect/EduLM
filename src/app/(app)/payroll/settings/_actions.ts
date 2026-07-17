"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { decimalStringToCents } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string };

const num = (v: FormDataEntryValue | null | undefined): number | null => {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : null;
};

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "Aucun établissement" };

  const exchangeRate = num(formData.get("exchangeRate"));
  const workingDaysPerMonth = Math.max(1, Math.min(31, Math.round(num(formData.get("workingDaysPerMonth")) ?? 22)));
  const fuelPriceCents = BigInt(decimalStringToCents(String(formData.get("fuelPrice") ?? "0")) ?? 0);
  const fuelPriceCurrency = String(formData.get("fuelPriceCurrency") ?? "USD") === "LBP" ? "LBP" : "USD";
  const minTransportCents = BigInt(decimalStringToCents(String(formData.get("minTransport") ?? "0")) ?? 0);
  const kmPerLitre = Math.max(0.1, num(formData.get("kmPerLitre")) ?? 7.5);

  // Category rate rows (name / tax% / nfs%), aligned by index. Percentages in
  // the form are stored as decimals (2 → 0.02). Blank names are skipped.
  const names = formData.getAll("catName").map((v) => String(v).trim());
  const taxes = formData.getAll("catTax");
  const nfses = formData.getAll("catNfs");
  const taxRates: Record<string, number> = {};
  const nfsRates: Record<string, number> = {};
  names.forEach((name, i) => {
    if (!name) return;
    taxRates[name] = Math.max(0, (num(taxes[i]) ?? 0)) / 100;
    nfsRates[name] = Math.max(0, (num(nfses[i]) ?? 0)) / 100;
  });

  const data = {
    exchangeRate,
    workingDaysPerMonth,
    fuelPriceCents,
    fuelPriceCurrency,
    minTransportCents,
    kmPerLitre,
    taxRates,
    nfsRates,
  };

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.tenantPayrollSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  });
  revalidatePath("/payroll/settings");
  return { ok: true };
}

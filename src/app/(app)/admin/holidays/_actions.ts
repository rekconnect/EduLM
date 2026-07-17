"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

export type FormState = { error?: string; ok?: number };

const schema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    label: z.string().trim().min(1).max(120),
  })
  .refine((d) => !d.to || d.to >= d.from, { path: ["to"], message: "range" });

const toUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function addHoliday(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { error: "Aucun établissement" };
  const parsed = schema.safeParse({
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
    label: String(formData.get("label") ?? ""),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message === "range" ? "rangeError" : "invalid" };
  }
  const { from, to, label } = parsed.data;

  // Expand an inclusive [from, to] break into one row per calendar day (cap 60).
  const start = toUtc(from);
  const end = to ? toUtc(to) : start;
  const rows: { tenantId: string; date: Date; label: string }[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 60) {
    rows.push({ tenantId, date: new Date(cursor), label });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  if (cursor <= end) return { error: "tooLong" };

  let created = 0;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const res = await db.tenantHoliday.createMany({ data: rows, skipDuplicates: true });
    created = res.count;
  });
  revalidatePath("/admin/holidays");
  return { ok: created };
}

export async function deleteHoliday(id: string): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.tenantHoliday.deleteMany({ where: { id } });
  });
  revalidatePath("/admin/holidays");
}

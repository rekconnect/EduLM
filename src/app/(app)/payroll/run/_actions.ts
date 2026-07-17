"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { computeMonthlyPayslips } from "@/lib/payroll-run";
import type { Prisma } from "@prisma/client";

/**
 * Generate (create/update) payslips for a month from the current rules. Existing
 * run-generated OR manual EduLM payslips for the month are overwritten; Dars-
 * imported history (darsSalaryId set) is never touched. Preserves publishedAt.
 */
export async function generateMonth(year: number, month: number): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const results = await computeMonthlyPayslips(year, month);
    const existing = await db.payslip.findMany({
      where: { year, month, employeeId: { in: results.map((r) => r.employeeId) } },
      select: { id: true, employeeId: true, darsSalaryId: true, publishedAt: true },
    });
    const byEmp = new Map(existing.map((e) => [e.employeeId, e]));
    const now = new Date();
    for (const r of results) {
      const prev = byEmp.get(r.employeeId);
      if (prev?.darsSalaryId != null) continue; // never overwrite Dars history
      const data = {
        netUsdCents: BigInt(r.netUsdCents),
        netLbpCents: BigInt(r.netLbpCents),
        daysWorked: r.daysWorked,
        breakdown: r.breakdown as unknown as Prisma.InputJsonValue,
        generatedAt: now,
      };
      if (prev) {
        await db.payslip.update({ where: { id: prev.id }, data });
      } else {
        await db.payslip.create({ data: { tenantId, employeeId: r.employeeId, year, month, ...data } });
      }
    }
  });
  revalidatePath("/payroll/run");
  revalidatePath("/payroll");
}

/** Publish (or unpublish) all generated payslips for a month — gates staff visibility. */
export async function setMonthPublished(year: number, month: number, published: boolean): Promise<void> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.payslip.updateMany({
      where: { year, month, generatedAt: { not: null } },
      data: { publishedAt: published ? new Date() : null },
    });
  });
  revalidatePath("/payroll/run");
  revalidatePath("/staff/payslips");
  revalidatePath("/staff");
}

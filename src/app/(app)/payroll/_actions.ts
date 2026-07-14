"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { decimalStringToCents } from "@/lib/money";

export type FormState = { errors?: Record<string, string>; formError?: string };

function fieldErrors(err: z.ZodError): Record<string, string> {
  const flat = z.flattenError(err).fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) if (v && v.length) out[k] = v[0]!;
  return out;
}

// ───────────────────────── Employees ─────────────────────────

const employeeSchema = z.object({
  displayName: z.string().trim().min(1, "Nom requis").max(120),
  jobTitle: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  employmentType: z.string().trim().max(60).optional(),
  recruitedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
    .optional()
    .or(z.literal("")),
  active: z.string().optional(),
});

function empDataFrom(formData: FormData) {
  return {
    displayName: String(formData.get("displayName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "") || undefined,
    department: String(formData.get("department") ?? "") || undefined,
    employmentType: String(formData.get("employmentType") ?? "") || undefined,
    recruitedAt: String(formData.get("recruitedAt") ?? "") || undefined,
    active: String(formData.get("active") ?? ""),
  };
}

function empWriteData(d: z.infer<typeof employeeSchema>) {
  const active = d.active === "on" || d.active === "true";
  return {
    displayName: d.displayName,
    jobTitle: d.jobTitle ?? null,
    department: d.department ?? null,
    employmentType: d.employmentType ?? null,
    active,
    recruitedAt: d.recruitedAt ? new Date(`${d.recruitedAt}T00:00:00.000Z`) : null,
  };
}

export async function createEmployee(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "Aucun établissement" };
  const parsed = employeeSchema.safeParse(empDataFrom(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const created = await db.payrollEmployee.create({
      data: { tenantId, ...empWriteData(parsed.data) },
      select: { id: true },
    });
    newId = created.id;
  });
  if (!newId) return { formError: "Échec de la création" };
  revalidatePath("/payroll");
  redirect(`/payroll/employees/${newId}`);
}

export async function updateEmployee(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "Aucun établissement" };
  const parsed = employeeSchema.safeParse(empDataFrom(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const data = empWriteData(parsed.data);
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.payrollEmployee.update({
      where: { id },
      data: { ...data, resignedAt: data.active ? null : undefined },
    });
  });
  revalidatePath(`/payroll/employees/${id}`);
  revalidatePath("/payroll");
  return { formError: undefined, errors: undefined };
}

export async function deleteEmployee(id: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    // delete cascades to payslips
    await db.payrollEmployee.delete({ where: { id } });
  });
  revalidatePath("/payroll");
  redirect("/payroll");
}

// ───────────────────────── Payslips ─────────────────────────

const payslipSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  netLbp: z.string().optional(),
  netUsd: z.string().optional(),
  salaryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  paid: z.string().optional(),
});

function payslipWriteData(formData: FormData) {
  const p = payslipSchema.safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
    netLbp: String(formData.get("netLbp") ?? ""),
    netUsd: String(formData.get("netUsd") ?? ""),
    salaryDate: String(formData.get("salaryDate") ?? ""),
    paid: String(formData.get("paid") ?? ""),
  });
  if (!p.success) return null;
  const d = p.data;
  return {
    year: d.year,
    month: d.month,
    netLbpCents: BigInt(decimalStringToCents(d.netLbp || "0") ?? 0),
    netUsdCents: BigInt(decimalStringToCents(d.netUsd || "0") ?? 0),
    paid: d.paid === "on" || d.paid === "true",
    salaryDate: d.salaryDate ? new Date(`${d.salaryDate}T00:00:00.000Z`) : null,
  };
}

export async function createPayslip(employeeId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const data = payslipWriteData(formData);
  if (!data) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const emp = await db.payrollEmployee.findFirst({ where: { id: employeeId }, select: { id: true } });
    if (!emp) return;
    await db.payslip.create({ data: { tenantId, employeeId, ...data } });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
}

export async function updatePayslip(id: string, employeeId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const data = payslipWriteData(formData);
  if (!data) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.payslip.update({ where: { id }, data });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
}

export async function deletePayslip(id: string, employeeId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.payslip.delete({ where: { id } });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
}

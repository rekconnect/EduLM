"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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
  email: z
    .string()
    .trim()
    .max(190)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email invalide")
    .optional()
    .or(z.literal("")),
  supervisorId: z.string().trim().max(40).optional().or(z.literal("")),
  taxCategory: z.string().trim().max(60).optional().or(z.literal("")),
  defaultDaysPerMonth: z
    .string()
    .regex(/^\d{1,2}$/)
    .optional()
    .or(z.literal("")),
  kmDistance: z.string().optional().or(z.literal("")),
});

function empDataFrom(formData: FormData) {
  return {
    displayName: String(formData.get("displayName") ?? ""),
    jobTitle: String(formData.get("jobTitle") ?? "") || undefined,
    department: String(formData.get("department") ?? "") || undefined,
    employmentType: String(formData.get("employmentType") ?? "") || undefined,
    recruitedAt: String(formData.get("recruitedAt") ?? "") || undefined,
    active: String(formData.get("active") ?? ""),
    email: String(formData.get("email") ?? "") || undefined,
    supervisorId: String(formData.get("supervisorId") ?? "") || undefined,
    taxCategory: String(formData.get("taxCategory") ?? "") || undefined,
    defaultDaysPerMonth: String(formData.get("defaultDaysPerMonth") ?? "") || undefined,
    kmDistance: String(formData.get("kmDistance") ?? "") || undefined,
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
    email: d.email ? d.email.toLowerCase() : null,
    supervisorId: d.supervisorId || null,
    taxCategory: d.taxCategory || null,
    defaultDaysPerMonth: d.defaultDaysPerMonth ? Number(d.defaultDaysPerMonth) : null,
    kmDistance: d.kmDistance != null && d.kmDistance !== "" ? Math.max(0, parseFloat(d.kmDistance) || 0) : 0,
  };
}

/**
 * Provision or link the staff-portal account for an employee's email. Unknown
 * address → creates a STAFF user (no password — signs in via Microsoft SSO
 * only). Known address (teacher, admin…) → linked as-is, role untouched.
 * Cleared email → unlink. A user already claimed by another employee is left
 * alone (userId is unique).
 */
async function linkStaffUser(
  tenantId: string,
  employeeId: string,
  email: string | null,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!email) {
    await db.payrollEmployee.update({ where: { id: employeeId }, data: { userId: null } });
    return { ok: true };
  }
  // Only LIVE users are linkable — matching the sign-in gate (findOAuthUser
  // refuses deleted/disabled accounts). Linking to a tombstoned parent would
  // create a dead link that locks the staff member out with no way to repair.
  const existing = await db.user.findFirst({
    where: { email, deletedAt: null, status: { not: "DISABLED" } },
  });
  let account = existing;
  if (!account) {
    try {
      account = await db.user.create({
        data: { tenantId, email, role: "STAFF", status: "ACTIVE", name: displayName, locale: "fr" },
      });
    } catch (e) {
      // Unique (tenantId, email) collision → a soft-deleted/disabled user still
      // holds this address. Leave the employee UNLINKED (never a dead link) and
      // tell the admin so they can pick another address or restore the account.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await db.payrollEmployee.update({ where: { id: employeeId }, data: { userId: null } });
        return {
          ok: false,
          error:
            "Cette adresse e-mail est déjà utilisée par un compte désactivé ou supprimé. Choisissez une autre adresse ou faites réactiver le compte.",
        };
      }
      throw e;
    }
  }
  const claimedByOther = await db.payrollEmployee.findFirst({
    where: { userId: account.id, NOT: { id: employeeId } },
    select: { id: true },
  });
  if (claimedByOther) {
    await db.payrollEmployee.update({ where: { id: employeeId }, data: { userId: null } });
    return {
      ok: false,
      error: "Cette adresse e-mail est déjà reliée à un autre employé.",
    };
  }
  await db.payrollEmployee.update({ where: { id: employeeId }, data: { userId: account.id } });
  return { ok: true };
}

/**
 * Sanitize a chosen supervisor id: must be an existing employee in this tenant
 * (the tenant-scoped client enforces the tenant) and never the employee itself.
 * Returns null when invalid so a bad/crafted id can't hit a FK error or create
 * a self-supervision loop.
 */
async function validSupervisorId(supervisorId: string | null, selfId: string | null): Promise<string | null> {
  if (!supervisorId || supervisorId === selfId) return null;
  const exists = await db.payrollEmployee.findFirst({
    where: { id: supervisorId },
    select: { id: true },
  });
  return exists ? supervisorId : null;
}

export async function createEmployee(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "Aucun établissement" };
  const parsed = employeeSchema.safeParse(empDataFrom(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  let newId: string | undefined;
  let linkError: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const data = empWriteData(parsed.data);
    data.supervisorId = await validSupervisorId(data.supervisorId, null);
    const created = await db.payrollEmployee.create({
      data: { tenantId, ...data },
      select: { id: true },
    });
    newId = created.id;
    if (data.email) {
      const r = await linkStaffUser(tenantId, created.id, data.email, data.displayName);
      if (!r.ok) linkError = r.error;
    }
  });
  if (!newId) return { formError: "Échec de la création" };
  revalidatePath("/payroll");
  redirect(
    linkError
      ? `/payroll/employees/${newId}?linkError=${encodeURIComponent(linkError)}`
      : `/payroll/employees/${newId}`,
  );
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
  let linkError: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    data.supervisorId = await validSupervisorId(data.supervisorId, id);
    await db.payrollEmployee.update({
      where: { id },
      data: { ...data, resignedAt: data.active ? null : undefined },
    });
    const r = await linkStaffUser(tenantId, id, data.email, data.displayName);
    if (!r.ok) linkError = r.error;
  });
  revalidatePath(`/payroll/employees/${id}`);
  revalidatePath("/payroll");
  return { formError: linkError, errors: undefined };
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

// ───────────────────────── Salary components ─────────────────────────

const componentSchema = z.object({
  kind: z.enum(["EARNING", "DEDUCTION"]),
  label: z.string().trim().min(1, "Libellé requis").max(60),
  currency: z.enum(["USD", "LBP"]),
  amount: z.string().optional(),
  perDay: z.string().optional(),
  taxable: z.string().optional(),
});

const asBool = (v: string) => v === "on" || v === "true";

function componentWriteData(formData: FormData) {
  const p = componentSchema.safeParse({
    kind: String(formData.get("kind") ?? ""),
    label: String(formData.get("label") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    perDay: String(formData.get("perDay") ?? ""),
    taxable: String(formData.get("taxable") ?? ""),
  });
  if (!p.success) return null;
  const d = p.data;
  return {
    kind: d.kind,
    label: d.label,
    currency: d.currency,
    amountCents: BigInt(decimalStringToCents(d.amount || "0") ?? 0),
    perDay: asBool(d.perDay ?? ""),
    // Only earnings can be taxable; deductions never carry a taxable flag.
    taxable: d.kind === "EARNING" && asBool(d.taxable ?? ""),
  };
}

export async function createComponent(employeeId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const data = componentWriteData(formData);
  if (!data) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const emp = await db.payrollEmployee.findFirst({ where: { id: employeeId }, select: { id: true } });
    if (!emp) return;
    const max = await db.salaryComponent.aggregate({
      where: { employeeId },
      _max: { sortOrder: true },
    });
    await db.salaryComponent.create({
      data: { tenantId, employeeId, ...data, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
}

export async function updateComponent(id: string, employeeId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  const data = componentWriteData(formData);
  if (!data) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.salaryComponent.update({ where: { id }, data });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
}

export async function deleteComponent(id: string, employeeId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.salaryComponent.delete({ where: { id } });
  });
  revalidatePath(`/payroll/employees/${employeeId}`);
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

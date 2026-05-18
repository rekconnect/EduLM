"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { decimalStringToCents, sumLines } from "@/lib/money";
import {
  sendInvoiceIssuedEmail,
  sendPaymentReceiptEmail,
} from "@/lib/emails/notifications";

const STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED", "OVERDUE"] as const;
const METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "OTHER"] as const;

const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.string().min(1),
  quantity: z.string().optional(),
});

const invoiceSchema = z.object({
  studentId: z.string().min(1),
  number: z.string().trim().min(1).max(40),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().trim().length(3),
  notes: z.string().max(2000).optional(),
  status: z.enum(STATUSES).optional(),
  lines: z.array(lineSchema).min(1),
});

export type InvoiceFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

function parseLinesFromFormData(formData: FormData) {
  const map = new Map<string, { description: string; amount: string; quantity: string }>();
  for (const key of formData.keys()) {
    const m = key.match(/^line\[(\d+)\]\[(description|amount|quantity)\]$/);
    if (!m) continue;
    const [, idx, field] = m;
    const cur = map.get(idx!) ?? { description: "", amount: "", quantity: "" };
    cur[field as "description" | "amount" | "quantity"] = String(formData.get(key) ?? "");
    map.set(idx!, cur);
  }
  return Array.from(map.values()).filter((l) => l.description !== "" || l.amount !== "");
}

export async function createInvoice(
  _prev: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };

  const lines = parseLinesFromFormData(formData);
  const parsed = invoiceSchema.safeParse({
    studentId: String(formData.get("studentId") ?? ""),
    number: String(formData.get("number") ?? ""),
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    notes: String(formData.get("notes") ?? "") || undefined,
    status: (String(formData.get("status") ?? "DRAFT") || "DRAFT") as (typeof STATUSES)[number],
    lines,
  });

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) {
      if (v && v.length > 0) errors[k] = v[0]!;
    }
    return { errors };
  }

  // Convert lines to cents; bail if any line has invalid amount.
  const linesPrepared = parsed.data.lines.map((l) => {
    const cents = decimalStringToCents(l.amount);
    const qty = l.quantity && l.quantity !== "" ? parseInt(l.quantity, 10) : 1;
    return { description: l.description, amountCents: cents ?? NaN, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1 };
  });
  if (linesPrepared.some((l) => !Number.isFinite(l.amountCents))) {
    return { errors: { lines: "Invalid amount" } };
  }
  const totalCents = sumLines(linesPrepared);

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const activeYear = await db.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!activeYear) return;
    const created = await db.invoice.create({
      data: {
        tenantId,
        studentId: parsed.data.studentId,
        academicYearId: activeYear.id,
        number: parsed.data.number,
        currency: parsed.data.currency,
        totalCents,
        notes: parsed.data.notes ?? null,
        dueAt: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T00:00:00.000Z`) : null,
        status: parsed.data.status ?? "DRAFT",
        lines: { create: linesPrepared },
      },
      select: { id: true },
    });
    newId = created.id;
  });

  if (!newId) return { formError: "No active academic year" };
  revalidatePath("/billing");
  redirect(`/billing/${newId}`);
}

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.string().min(1),
  method: z.enum(METHODS),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordPayment(invoiceId: string, formData: FormData) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;

  const parsed = paymentSchema.safeParse({
    invoiceId,
    amount: String(formData.get("amount") ?? ""),
    method: String(formData.get("method") ?? "CASH"),
    paidAt: String(formData.get("paidAt") ?? "") || undefined,
    reference: String(formData.get("reference") ?? "") || undefined,
    notes: String(formData.get("notes") ?? "") || undefined,
  });
  if (!parsed.success) return;

  const amountCents = decimalStringToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) return;

  let notifyContext: {
    remainingCents: number;
    paidAt: Date;
  } | null = null;

  await runWithTenant({ tenantId, slug: null }, async () => {
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: { select: { amountCents: true } } },
    });
    if (!invoice) return;

    const paidAt = parsed.data.paidAt
      ? new Date(`${parsed.data.paidAt}T00:00:00.000Z`)
      : new Date();

    await db.payment.create({
      data: {
        tenantId,
        invoiceId,
        amountCents,
        method: parsed.data.method,
        paidAt,
        recordedById: user.id,
        reference: parsed.data.reference ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    const totalPaid =
      invoice.payments.reduce((acc, p) => acc + p.amountCents, 0) + amountCents;
    const newStatus =
      totalPaid >= invoice.totalCents
        ? "PAID"
        : totalPaid > 0
          ? "PARTIALLY_PAID"
          : invoice.status;
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
    });

    notifyContext = {
      remainingCents: Math.max(0, invoice.totalCents - totalPaid),
      paidAt,
    };
  });

  if (notifyContext) {
    notifyParentOfPayment(tenantId, invoiceId, amountCents, parsed.data.method, notifyContext).catch(
      (e) => console.error("[email] paymentReceipt notify failed:", e),
    );
  }

  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing");
  revalidatePath("/parent/invoices");
}

async function notifyParentOfPayment(
  tenantId: string,
  invoiceId: string,
  amountCents: number,
  method: string,
  ctx: { remainingCents: number; paidAt: Date },
) {
  const u = unscopedDb();
  try {
    const [tenant, invoice] = await Promise.all([
      u.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      u.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          number: true,
          currency: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianLinks: {
                where: { isPrimary: true },
                take: 1,
                select: {
                  guardian: { select: { user: { select: { email: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!tenant || !invoice) return;
    const guardianUser = invoice.student.guardianLinks[0]?.guardian.user;
    if (!guardianUser?.email) return;
    await sendPaymentReceiptEmail({
      to: { email: guardianUser.email, name: guardianUser.name },
      tenantName: tenant.name,
      invoiceNumber: invoice.number,
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
      amountCents,
      currency: invoice.currency,
      remainingCents: ctx.remainingCents,
      paymentMethod: method,
      paymentDate: ctx.paidAt,
    });
  } finally {
    await u.$disconnect();
  }
}

export async function deleteInvoice(invoiceId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.invoice.delete({ where: { id: invoiceId } });
  });
  revalidatePath("/billing");
  redirect("/billing");
}

export async function issueInvoice(invoiceId: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "ISSUED", issuedAt: new Date() },
    });
  });
  notifyParentOfInvoiceIssued(tenantId, invoiceId).catch((e) =>
    console.error("[email] invoiceIssued notify failed:", e),
  );
  revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/billing");
}

async function notifyParentOfInvoiceIssued(tenantId: string, invoiceId: string) {
  const u = unscopedDb();
  try {
    const [tenant, invoice] = await Promise.all([
      u.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      u.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          number: true,
          currency: true,
          totalCents: true,
          dueAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianLinks: {
                where: { isPrimary: true },
                take: 1,
                select: {
                  guardian: { select: { user: { select: { email: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!tenant || !invoice) return;
    const guardianUser = invoice.student.guardianLinks[0]?.guardian.user;
    if (!guardianUser?.email) return;
    await sendInvoiceIssuedEmail({
      to: { email: guardianUser.email, name: guardianUser.name },
      tenantName: tenant.name,
      invoiceNumber: invoice.number,
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      dueAt: invoice.dueAt,
      invoiceId,
    });
  } finally {
    await u.$disconnect();
  }
}

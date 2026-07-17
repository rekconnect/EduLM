"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withStaffSession } from "@/lib/session";
import { notifyUser } from "@/lib/staff-notify";
import { countWorkingDays, isoDay } from "@/lib/working-days";
import { kindLabelKey } from "../_request-shared";

export type FormState = { errors?: Record<string, string>; formError?: string; ok?: boolean };

const TIME = /^\d{2}:\d{2}$/;

const schema = z
  .object({
    // ABSENCE = date range, no times. PERMISSION = single day, REQUIRED times.
    // PRESENCE / PERMANENCE = single day, OPTIONAL times.
    kind: z.enum(["ABSENCE", "PERMISSION", "PRESENCE", "PERMANENCE"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    startTime: z.string().regex(TIME).optional().or(z.literal("")),
    endTime: z.string().regex(TIME).optional().or(z.literal("")),
    reason: z.string().trim().min(3, "Motif requis").max(500),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "ABSENCE") {
      if (!d.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "Date invalide" });
      } else if (d.endDate < d.startDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "La date de fin doit suivre la date de début" });
      }
    }
    if (d.kind === "PERMISSION") {
      if (!d.startTime || !d.endTime) {
        ctx.addIssue({ code: "custom", path: ["startTime"], message: "Heures requises" });
      } else if (d.endTime <= d.startTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "L'heure de fin doit suivre l'heure de début" });
      }
    }
    if (d.kind === "PRESENCE" || d.kind === "PERMANENCE") {
      // Times optional — but all-or-nothing, and coherent when given.
      if (!!d.startTime !== !!d.endTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "Indiquez les deux heures ou aucune" });
      } else if (d.startTime && d.endTime && d.endTime <= d.startTime) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: "L'heure de fin doit suivre l'heure de début" });
      }
    }
  });

const toUtcDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

function fieldErrors(err: z.ZodError): Record<string, string> {
  const flat = z.flattenError(err).fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) if (v && v.length) out[k] = v[0]!;
  return out;
}

export async function submitRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  return withStaffSession(async (_user, employee): Promise<FormState> => {
    if (!employee) return { formError: "Votre compte n'est pas relié à une fiche employé." };
    const parsed = schema.safeParse({
      kind: String(formData.get("kind") ?? ""),
      startDate: String(formData.get("startDate") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
    if (!parsed.success) return { errors: fieldErrors(parsed.error) };
    const d = parsed.data;
    const isRange = d.kind === "ABSENCE";
    const hasTimes = d.kind !== "ABSENCE" && !!d.startTime && !!d.endTime;
    const startDate = toUtcDate(d.startDate);
    const endDate = isRange && d.endDate ? toUtcDate(d.endDate) : startDate;

    // Deductible working days (Mon–Fri minus holidays), snapshotted now against
    // the current holiday calendar. PERMISSION is hours-based, not a day unit.
    let workingDays: number | null = null;
    if (d.kind !== "PERMISSION") {
      const hol = await db.tenantHoliday.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        select: { date: true },
      });
      workingDays = countWorkingDays(startDate, endDate, new Set(hol.map((h) => isoDay(h.date))));
    }

    // A supervisor only routes the request if they have a portal account to act
    // on it; otherwise the request goes straight to the finance stage so it can
    // never get stuck on an unreachable approver.
    const supervisor = employee.supervisorId
      ? await db.payrollEmployee.findFirst({
          where: { id: employee.supervisorId },
          select: { id: true, displayName: true, user: { select: { id: true, locale: true } } },
        })
      : null;
    const reachable = supervisor?.user ? supervisor : null;

    const created = await db.attendanceRequest.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        kind: d.kind,
        status: reachable ? "PENDING_SUPERVISOR" : "PENDING_FINANCE",
        startDate,
        endDate,
        startTime: hasTimes ? d.startTime! : null,
        endTime: hasTimes ? d.endTime! : null,
        reason: d.reason,
        workingDays,
        supervisorId: reachable?.id ?? null,
      },
      select: { id: true, startDate: true, endDate: true },
    });

    if (reachable?.user) {
      const dates =
        created.startDate.getTime() === created.endDate.getTime()
          ? d.startDate
          : `${d.startDate} → ${d.endDate}`;
      // Render the kind label in the supervisor's own locale for the notification.
      const tSup = await getTranslations({ locale: reachable.user.locale || "fr", namespace: "staff" });
      await notifyUser(
        reachable.user,
        "submitted",
        { name: employee.displayName, kind: tSup(kindLabelKey(d.kind)), dates },
        "/staff/approvals",
      );
    }

    revalidatePath("/staff/requests");
    revalidatePath("/staff");
    revalidatePath("/staff/approvals");
    return { ok: true };
  });
}

export async function cancelRequest(id: string): Promise<void> {
  await withStaffSession(async (_user, employee) => {
    if (!employee) return;
    // Only the owner, and only while still awaiting the supervisor.
    const req = await db.attendanceRequest.findFirst({
      where: { id, employeeId: employee.id, status: "PENDING_SUPERVISOR" },
      select: { id: true, supervisorId: true, kind: true, startDate: true, endDate: true },
    });
    if (!req) return;
    // Atomic: no-op if a supervisor decision already moved it out of PENDING_SUPERVISOR.
    const { count } = await db.attendanceRequest.updateMany({
      where: { id: req.id, employeeId: employee.id, status: "PENDING_SUPERVISOR" },
      data: { status: "CANCELLED" },
    });
    if (count === 0) return;

    if (req.supervisorId) {
      const sup = await db.payrollEmployee.findFirst({
        where: { id: req.supervisorId },
        select: { user: { select: { id: true, locale: true } } },
      });
      if (sup?.user) {
        const dates =
          req.startDate.getTime() === req.endDate.getTime()
            ? req.startDate.toISOString().slice(0, 10)
            : `${req.startDate.toISOString().slice(0, 10)} → ${req.endDate.toISOString().slice(0, 10)}`;
        const tSup = await getTranslations({ locale: sup.user.locale || "fr", namespace: "staff" });
        await notifyUser(
          sup.user,
          "cancelled",
          { name: employee.displayName, kind: tSup(kindLabelKey(req.kind)), dates },
          "/staff/approvals",
        );
      }
    }

    revalidatePath("/staff/requests");
    revalidatePath("/staff/approvals");
    revalidatePath("/staff");
  });
}

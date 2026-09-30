"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { nextLevel } from "@/lib/levels";

const yearSchema = z.object({
  label: z.string().trim().min(1).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.string().optional().transform((v) => v === "on" || v === "true"),
});

export type YearFormState = {
  errors?: Record<string, string>;
  formError?: string;
};

export async function createYear(
  _prev: YearFormState,
  formData: FormData,
): Promise<YearFormState> {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "no-tenant" };

  const parsed = yearSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    isActive: String(formData.get("isActive") ?? ""),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat)) if (v?.[0]) errors[k] = v[0];
    return { errors };
  }

  const generateClasses = String(formData.get("generateClasses") ?? "") === "on";
  let didCreate = false;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const existing = await db.academicYear.findUnique({
      where: { tenantId_label: { tenantId, label: parsed.data.label } },
      select: { id: true },
    });
    if (existing) return;
    // If marking this one as active, demote the previous active year.
    if (parsed.data.isActive) {
      await db.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }
    const created = await db.academicYear.create({
      data: {
        tenantId,
        label: parsed.data.label,
        startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
        endDate: new Date(`${parsed.data.endDate}T23:59:59.000Z`),
        isActive: parsed.data.isActive,
      },
    });
    didCreate = true;
    // Classes per niveau, sections A–D — so admissions can accept dossiers
    // into this year right away.
    if (generateClasses) await generateClassesInternal(tenantId, created.id);
  });

  if (!didCreate) return { errors: { label: "yearAlreadyExists" } };
  revalidatePath("/admin/years");
  redirect("/admin/years");
}

export type PromoteResult = {
  ok: boolean;
  error?: string;
  promoted?: number;
  graduated?: number;
  skippedExisting?: number;
  excluded?: number;
  sourceLabel?: string;
  targetLabel?: string;
};

/**
 * Year rollover: promote every student enrolled in the previous year up one
 * grade into `targetYearId`. Terminale (last level) graduates out and is not
 * promoted; students in `excludeStudentIds` (repeaters / leavers) are skipped;
 * students already enrolled in the target year are skipped (idempotent — safe
 * to re-run, and it won't touch new students imported/registered separately).
 * Each promoted student lands in a RANDOM existing section of their new level
 * (a placeholder class is created if the level has none yet) — the real
 * section is assigned manually later.
 */
export async function promoteYear(
  targetYearId: string,
  excludeStudentIds: string[],
): Promise<PromoteResult> {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const exclude = new Set(excludeStudentIds);

  return runWithTenant({ tenantId, slug: null }, async () => {
    const target = await db.academicYear.findUnique({
      where: { id: targetYearId },
      select: { id: true, startDate: true, label: true },
    });
    if (!target) return { ok: false, error: "not-found" };

    // Source = the most recent year BEFORE the target that has enrollments.
    const source = await db.academicYear.findFirst({
      where: {
        startDate: { lt: target.startDate },
        enrollments: { some: {} },
      },
      orderBy: { startDate: "desc" },
      select: { id: true, label: true },
    });
    if (!source) return { ok: false, error: "no-source" };

    const [srcEnroll, alreadyRows, targetClasses] = await Promise.all([
      db.enrollment.findMany({
        where: { academicYearId: source.id },
        select: { studentId: true, class: { select: { level: true } } },
      }),
      db.enrollment.findMany({
        where: { academicYearId: target.id },
        select: { studentId: true },
      }),
      db.class.findMany({
        where: { academicYearId: target.id },
        select: { id: true, level: true },
      }),
    ]);

    const already = new Set(alreadyRows.map((r) => r.studentId));
    const classesByLevel = new Map<string, string[]>();
    for (const c of targetClasses) {
      const list = classesByLevel.get(c.level) ?? [];
      list.push(c.id);
      classesByLevel.set(c.level, list);
    }
    // Random existing section of `level`, creating a placeholder class if none.
    const classIdFor = async (level: string): Promise<string> => {
      const list = classesByLevel.get(level);
      if (list && list.length > 0) {
        return list[Math.floor(Math.random() * list.length)]!;
      }
      const created = await db.class.create({
        data: {
          tenantId,
          academicYearId: target.id,
          level,
          section: "Non assigné",
          name: `${level} · Non assigné`,
        },
        select: { id: true },
      });
      classesByLevel.set(level, [created.id]);
      return created.id;
    };

    let graduated = 0;
    let skippedExisting = 0;
    let excluded = 0;
    const toCreate: { tenantId: string; studentId: string; classId: string; academicYearId: string }[] = [];
    for (const e of srcEnroll) {
      if (exclude.has(e.studentId)) { excluded++; continue; }
      const nl = nextLevel(e.class.level);
      if (nl === null) { graduated++; continue; } // Terminale / unknown → graduates
      if (already.has(e.studentId)) { skippedExisting++; continue; }
      const classId = await classIdFor(nl);
      toCreate.push({ tenantId, studentId: e.studentId, classId, academicYearId: target.id });
      already.add(e.studentId); // guard against duplicate source rows
    }

    if (toCreate.length > 0) {
      await db.enrollment.createMany({ data: toCreate, skipDuplicates: true });
    }

    revalidatePath("/admin/years");
    revalidatePath("/classes");
    return {
      ok: true,
      promoted: toCreate.length,
      graduated,
      skippedExisting,
      excluded,
      sourceLabel: source.label,
      targetLabel: target.label,
    };
  });
}

export async function setActiveYear(yearId: string) {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.academicYear.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await db.academicYear.update({
      where: { id: yearId },
      data: { isActive: true },
    });
  });
  // A year change re-scopes the whole app (dashboard counts, student/parent/
  // class lists, transport, the sidebar switcher and every per-section year
  // dropdown), so revalidate everything under the app layout.
  revalidatePath("/", "layout");
}

/**
 * Hard delete an academic year. Cascades to Classes via the schema's
 * `onDelete: Cascade` and to Enrollments (which FK to both Class and
 * Year). Refuses if the year still has enrollments — those represent
 * real kids, deleting them silently would be data loss.
 */
export async function deleteYear(
  yearId: string,
): Promise<{ ok: boolean; error?: string; enrollmentCount?: number }> {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const year = await db.academicYear.findUnique({
      where: { id: yearId },
      select: {
        id: true,
        _count: { select: { enrollments: true, classes: true } },
      },
    });
    if (!year) return { ok: false, error: "not-found" };

    // Refuse when real enrollments still hang off the year — would
    // wipe student-classroom assignments silently.
    if (year._count.enrollments > 0) {
      return {
        ok: false,
        error: "has-enrollments",
        enrollmentCount: year._count.enrollments,
      };
    }

    await db.academicYear.delete({ where: { id: yearId } });
    revalidatePath("/admin/years");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    return { ok: true };
  });
}

// ── Class generation (Raed 2026-09-29) ──────────────────────────
// A new year needs its classes BEFORE admissions can accept dossiers
// (acceptance requires picking a class in the cycle's target year).
// Sections are generated A→D for every niveau — the school can't know in
// advance which sections will fill; unused empty sections get deleted later.

const GENERATED_SECTIONS = ["A", "B", "C", "D"] as const;

/** Niveaux from the tenant's ACTIVE establishments config (config-driven). */
async function tenantLevels(): Promise<string[]> {
  const { sortLevels } = await import("@/lib/levels");
  const establishments = await db.establishment.findMany({
    where: { isActive: true },
    select: { levels: true },
  });
  const set = new Set<string>();
  for (const e of establishments) {
    if (Array.isArray(e.levels)) {
      for (const l of e.levels) if (typeof l === "string" && l.trim()) set.add(l.trim());
    }
  }
  return sortLevels([...set]);
}

/** Idempotent: creates only the missing (niveau, section) pairs. */
async function generateClassesInternal(
  tenantId: string,
  yearId: string,
): Promise<{ created: number } | { error: string }> {
  const levels = await tenantLevels();
  if (levels.length === 0) return { error: "no-levels" };
  const existing = await db.class.findMany({
    where: { academicYearId: yearId },
    select: { level: true, section: true },
  });
  const have = new Set(existing.map((c) => `${c.level}|${c.section}`));
  const data: Array<{ tenantId: string; academicYearId: string; level: string; section: string; name: string }> = [];
  for (const level of levels) {
    for (const section of GENERATED_SECTIONS) {
      if (have.has(`${level}|${section}`)) continue;
      data.push({ tenantId, academicYearId: yearId, level, section, name: `${level} ${section}` });
    }
  }
  if (data.length > 0) await db.class.createMany({ data });
  return { created: data.length };
}

export async function generateClassesForYear(yearId: string): Promise<void> {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const year = await db.academicYear.findUnique({ where: { id: yearId }, select: { id: true } });
    if (!year) return;
    await generateClassesInternal(tenantId, yearId);
  });
  revalidatePath("/admin/years");
  revalidatePath("/classes");
}

/**
 * Rentrée cleanup (Raed 2026-09-29): once the real section lists are in,
 * remove the generated sections that stayed empty. Only classes with NO
 * enrollments, documents or announcements are touched — re-runnable, and
 * "Générer les classes" can always recreate a section later if needed.
 */
export async function deleteEmptyClasses(yearId: string): Promise<void> {
  const { user } = await requireModuleAccess("admissions", "full");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.class.deleteMany({
      where: {
        academicYearId: yearId,
        enrollments: { none: {} },
        documents: { none: {} },
        announcements: { none: {} },
      },
    });
  });
  revalidatePath("/admin/years");
  revalidatePath("/classes");
}

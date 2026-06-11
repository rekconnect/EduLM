"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import {
  parseEntityFieldsConfig,
  type EntityFieldsConfig,
} from "@/lib/entity-fields";

const STATUSES = ["PROSPECT", "ENROLLED", "WITHDRAWN", "GRADUATED"] as const;
const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const studentSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dob: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v !== "" ? new Date(v) : null))
    .refine((v) => v === null || !Number.isNaN(v.getTime()), { message: "Invalid date" }),
  status: z.enum(STATUSES),
  gender: z
    .string()
    .optional()
    .transform((v) => (v && (GENDERS as readonly string[]).includes(v) ? v : null))
    .pipe(z.enum(GENDERS).nullable()),
  nationality: optionalTrimmed(80),
  placeOfBirth: optionalTrimmed(120),
  address: optionalTrimmed(200),
  city: optionalTrimmed(80),
  postalCode: optionalTrimmed(20),
  country: optionalTrimmed(80),
  previousSchool: optionalTrimmed(160),
  emergencyContact: optionalTrimmed(200),
  internalNotes: optionalTrimmed(4000),
});

type StudentInput = z.input<typeof studentSchema>;

export type StudentFormState = {
  errors?: Partial<Record<keyof StudentInput, string>>;
  formError?: string;
};

const FIELDS = [
  "firstName",
  "lastName",
  "dob",
  "status",
  "gender",
  "nationality",
  "placeOfBirth",
  "address",
  "city",
  "postalCode",
  "country",
  "previousSchool",
  "emergencyContact",
  "internalNotes",
] as const;

function parseForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const f of FIELDS) {
    raw[f] = String(formData.get(f) ?? "");
  }
  return studentSchema.safeParse(raw);
}

function zodToState(error: z.ZodError): StudentFormState {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const errors: StudentFormState["errors"] = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v && v.length > 0) {
      (errors as Record<string, string>)[k] = v[0]!;
    }
  }
  return { errors };
}

export async function createStudent(
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };
  const parsed = parseForm(formData);
  if (!parsed.success) return zodToState(parsed.error);

  let newId: string | undefined;
  await runWithTenant({ tenantId, slug: null }, async () => {
    const created = await db.student.create({
      data: { tenantId, ...parsed.data },
      select: { id: true },
    });
    newId = created.id;
  });

  revalidatePath("/students");
  redirect(`/students/${newId}`);
}

export async function updateStudent(
  id: string,
  _prev: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { formError: "No tenant" };
  const parsed = parseForm(formData);
  if (!parsed.success) return zodToState(parsed.error);

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({
      where: { id },
      data: parsed.data,
    });
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return;
  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.delete({ where: { id } });
  });
  revalidatePath("/students");
  redirect("/students");
}

/**
 * Inline save of the built-in identity columns from the student fiche (the
 * "Identité" section's pencil) — same read-only + pencil UX as the custom
 * categories, instead of an always-open form. Returns {ok} for the client.
 */
export async function saveStudentIdentity(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(["SCHOOL_ADMIN", "TEACHER"]);
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  const parsed = studentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  return runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({ where: { id: studentId }, data: parsed.data });
    revalidatePath(`/students/${studentId}`);
    return { ok: true };
  });
}

/**
 * Inline per-category save from the student fiche (EditableGroup). Merges the
 * submitted values into Student.customAnswers by key, like the parent fiche's
 * saveStudentFiche, but revalidates the student detail page.
 */
export async function saveStudentFicheFields(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const answers: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};
    for (const [k, v] of Object.entries(values)) answers[k] = (v ?? "").trim();
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/admin/parents", "layout");
    return { ok: true };
  });
}

/**
 * Inline per-YEAR save from the student fiche's year-aware view
 * (StudentYearView). Authorizations and the transport mode are stored per
 * academic year inside customAnswers.registration_by_year[<year>], so editing
 * them merges into THAT year's object — never the single value (which gets
 * polluted by the latest in-progress re-registration draft). An empty value
 * clears the key for that year.
 */
export async function saveStudentRegistrationYear(
  studentId: string,
  year: string,
  fields: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const answers: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};

    let byYear: Record<string, Record<string, string>> = {};
    if (typeof answers.registration_by_year === "string") {
      try {
        byYear = JSON.parse(answers.registration_by_year) as Record<
          string,
          Record<string, string>
        >;
      } catch {
        byYear = {};
      }
    }
    const current: Record<string, string> = { ...(byYear[year] ?? {}) };
    for (const [k, v] of Object.entries(fields)) {
      const t = (v ?? "").trim();
      if (t === "") delete current[k];
      else current[k] = t;
    }
    byYear[year] = current;
    answers.registration_by_year = JSON.stringify(byYear);

    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
    revalidatePath(`/students/${studentId}`);
    return { ok: true };
  });
}

/**
 * Save the family's "personnes autorisées à récupérer l'élève" + emergency
 * contacts. The list is stored on the anchor guardian's User.customAnswers
 * (imported from Dars per parent) and shown on every child's fiche, so editing
 * from one child updates the whole family.
 */
export async function saveAuthorizedPersons(
  studentId: string,
  userId: string,
  persons: Array<{ relation: string; name: string; phone: string; emergency: boolean }>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const clean = persons
    .map((p) => ({
      relation: String(p.relation ?? "").trim().slice(0, 120),
      name: String(p.name ?? "").trim().slice(0, 160),
      phone: String(p.phone ?? "").trim().slice(0, 40),
      emergency: !!p.emergency,
    }))
    .filter((p) => p.name)
    .slice(0, 50);

  return runWithTenant({ tenantId, slug: null }, async () => {
    const u = await db.user.findFirst({
      where: { id: userId, tenantId, role: "PARENT" },
      select: { customAnswers: true },
    });
    if (!u) return { ok: false, error: "not-found" };
    const ca: Record<string, unknown> =
      u.customAnswers && typeof u.customAnswers === "object"
        ? { ...(u.customAnswers as Record<string, unknown>) }
        : {};
    ca.authorized_persons = JSON.stringify(clean);
    await db.user.update({ where: { id: userId }, data: { customAnswers: ca } });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/admin/parents", "layout");
    return { ok: true };
  });
}

/**
 * Bulk-save bus assignments from the transport management page. Field set
 * mirrors the Dars transport exports — PER DIRECTION, because a pupil can ride
 * different cars (even from different quartiers) morning vs evening (e.g. AS
 * Car 1 Antelias + RS Car 8 Naccache): trajet AR/AS/RS, then car / quartier /
 * station for matin and soir, plus free-text remarques. Stored as flat
 * customAnswers keys so they also show on the fiche.
 */
export async function saveBusAssignments(
  period: string, // "<yearLabel>|T1|T2|T3" — assignments are per trimester
  updates: Array<{
    studentId: string;
    bus_as: string; // "yes" → rides the morning (aller) bus
    bus_rs: string; // "yes" → rides the evening (retour) bus
    bus_car_matin: string;
    bus_zoneno_matin: string; // zone number 1-10
    bus_zone_matin: string; // quartier
    bus_station_matin: string;
    bus_car_soir: string;
    bus_zoneno_soir: string;
    bus_zone_soir: string;
    bus_station_soir: string;
    bus_remarques: string;
  }>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  if (updates.length === 0) return { ok: true };
  if (!/^.+\|T[123]$/.test(period)) return { ok: false, error: "bad-period" };

  // Superseded pre-period flat keys — removed on save (data now lives in
  // bus_periods). bus_zone stays: it is the legacy quartier seed/suggestion.
  const LEGACY = [
    "bus_trajet", "bus_car", "bus_station", "bus_heure", "bus_matin", "bus_soir",
    "bus_pre_activite", "bus_as", "bus_rs", "bus_car_matin", "bus_zone_matin",
    "bus_station_matin", "bus_car_soir", "bus_zone_soir", "bus_station_soir",
    "bus_remarques", "bus_tel", "bus_montant", "bus_paye",
  ];
  return runWithTenant({ tenantId, slug: null }, async () => {
    const ids = updates.map((u) => u.studentId);
    const rows = await db.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, customAnswers: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const u of updates) {
      const st = byId.get(u.studentId);
      if (!st) continue;
      const ca: Record<string, unknown> =
        st.customAnswers && typeof st.customAnswers === "object"
          ? { ...(st.customAnswers as Record<string, unknown>) }
          : {};
      let periods: Record<string, Record<string, string>> = {};
      if (typeof ca.bus_periods === "string") {
        try {
          periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
        } catch {
          periods = {};
        }
      }
      const as = u.bus_as === "yes";
      const rs = u.bus_rs === "yes";
      const zno = (v: string) => {
        const t = (v ?? "").trim();
        return /^([1-9]|10)$/.test(t) ? t : "";
      };
      const prev = periods[period] ?? {};
      periods[period] = {
        ...prev, // keeps tel/montant/remise/net from the import
        as: as ? "yes" : "",
        rs: rs ? "yes" : "",
        // A direction that's off carries no bus data.
        car_matin: as ? (u.bus_car_matin ?? "").trim().slice(0, 20) : "",
        zoneno_matin: as ? zno(u.bus_zoneno_matin) : "",
        zone_matin: as ? (u.bus_zone_matin ?? "").trim().slice(0, 80) : "",
        station_matin: as ? (u.bus_station_matin ?? "").trim().slice(0, 160) : "",
        car_soir: rs ? (u.bus_car_soir ?? "").trim().slice(0, 20) : "",
        zoneno_soir: rs ? zno(u.bus_zoneno_soir) : "",
        zone_soir: rs ? (u.bus_zone_soir ?? "").trim().slice(0, 80) : "",
        station_soir: rs ? (u.bus_station_soir ?? "").trim().slice(0, 160) : "",
        remarques: (u.bus_remarques ?? "").trim().slice(0, 400),
      };
      ca.bus_periods = JSON.stringify(periods);
      for (const k of LEGACY) delete ca[k];
      await db.student.update({
        where: { id: u.studentId },
        data: { customAnswers: ca },
      });
    }
    revalidatePath("/transport");
    for (const u of updates) revalidatePath(`/students/${u.studentId}`);
    return { ok: true };
  });
}

/**
 * Delete a student's bus assignment for one period ("the student left the
 * bus") — removes the period entry entirely, including its billing trace.
 */
export async function deleteBusAssignment(
  period: string,
  studentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };
  if (!/^.+\|T[123]$/.test(period)) return { ok: false, error: "bad-period" };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { customAnswers: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    const ca: Record<string, unknown> =
      st.customAnswers && typeof st.customAnswers === "object"
        ? { ...(st.customAnswers as Record<string, unknown>) }
        : {};
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch {
        periods = {};
      }
    }
    delete periods[period];
    if (Object.keys(periods).length === 0) delete ca.bus_periods;
    else ca.bus_periods = JSON.stringify(periods);
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: ca },
    });
    revalidatePath("/transport");
    revalidatePath(`/students/${studentId}`);
    return { ok: true };
  });
}

/**
 * Upsert the student's medical record from the fiche "Santé" tab. Sensitive —
 * SCHOOL_ADMIN only. Booleans arrive as "yes"/"no"/"" strings from the form;
 * "" means unanswered for the consent tri-states.
 */
export async function saveStudentMedicalRecord(
  studentId: string,
  values: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const txt = (k: string, max = 2000) => {
    const v = (values[k] ?? "").trim().slice(0, max);
    return v === "" ? null : v;
  };
  const flag = (k: string) => values[k] === "yes";
  const tri = (k: string) =>
    values[k] === "yes" ? true : values[k] === "no" ? false : null;

  const data = {
    bloodType: txt("bloodType", 8),
    diabetic: flag("diabetic"),
    asthma: flag("asthma"),
    epilepsy: flag("epilepsy"),
    scoliosis: flag("scoliosis"),
    favism: flag("favism"),
    hemophilia: flag("hemophilia"),
    cardiacProblem: flag("cardiacProblem"),
    allergies: txt("allergies"),
    medications: txt("medications"),
    hospitalization: txt("hospitalization"),
    surgeries: txt("surgeries"),
    majorIllnesses: txt("majorIllnesses"),
    chronicIllness: txt("chronicIllness"),
    familyHistory: txt("familyHistory"),
    specialNeeds: txt("specialNeeds"),
    remarks: txt("remarks"),
    pediatricianName: txt("pediatricianName", 160),
    pediatricianPhone: txt("pediatricianPhone", 40),
    allowEmergencyMeasures: tri("allowEmergencyMeasures"),
    allowDoctorExam: tri("allowDoctorExam"),
    allowParacetamol: tri("allowParacetamol"),
    allowMedicalTreatment: tri("allowMedicalTreatment"),
    unfitForSports: flag("unfitForSports"),
    unfitDuration: txt("unfitDuration", 160),
    unfitReason: txt("unfitReason", 400),
  };

  return runWithTenant({ tenantId, slug: null }, async () => {
    const st = await db.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!st) return { ok: false, error: "not-found" };
    await db.studentMedicalRecord.upsert({
      where: { studentId },
      create: { tenantId, studentId, ...data },
      update: data,
    });
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/infirmerie");
    return { ok: true };
  });
}

// ─── Custom answers (Round 6) ──────────────────────────────────

/** See updateParentCustomAnswers for the storage contract — same shape. */
export async function updateStudentCustomAnswers(
  studentId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return { ok: false, error: "no-tenant" };

  const tenant = await unscopedDb().tenant.findUnique({
    where: { id: tenantId },
    select: { studentFieldsConfig: true },
  });
  const config: EntityFieldsConfig = parseEntityFieldsConfig(
    tenant?.studentFieldsConfig,
  );
  const validIds = new Set(config.fields.map((f) => f.id));

  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("f-")) continue;
    const fieldId = k.slice(2);
    if (!validIds.has(fieldId)) continue;
    const value = String(v).trim();
    if (value.length === 0) continue;
    if (value.length > 2000) continue;
    answers[fieldId] = value;
  }

  await runWithTenant({ tenantId, slug: null }, async () => {
    await db.student.update({
      where: { id: studentId },
      data: { customAnswers: answers },
    });
  });
  revalidatePath(`/students/${studentId}`);
  return { ok: true };
}

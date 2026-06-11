/**
 * Import the Dars infirmary module into EduLM:
 *   - Med_History (infirmary-entered) + Med_HistoryOnline (parent online form,
 *     latest row per student) → StudentMedicalRecord (Online overlays History;
 *     condition booleans are OR-ed; allergies composed from flags + text)
 *   - Med_Immunizations → StudentImmunization (one row per student × vaccine id;
 *     multiple Dars dose-rows merged: done=any, notes=joined descriptions).
 *     Names come from vaccine-names.json (Dars hardcodes them in its app) —
 *     edit the file and re-run to fix names idempotently.
 *   - Med_Visit → MedicalVisit (vitals as columns, specialty exam fields in
 *     `details` JSON with French labels)
 * All keyed by REAL Isc_Student ids → Student.darsStudentId. Idempotent
 * (upserts by natural keys; visits replaced per student per run).
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-medical.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};
const HERE = dirname(fileURLToPath(import.meta.url));
const VACCINE_NAMES: Record<string, string> = JSON.parse(
  readFileSync(join(HERE, "vaccine-names.json"), "utf-8"),
);

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const b = (v: unknown): boolean => v === true || v === 1;
const nb = (v: unknown): boolean | null => (v == null ? null : b(v));
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // darsStudentId → EduLM id
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true },
  });
  const eduId = new Map(students.map((st) => [Number(st.darsStudentId), st.id]));
  console.log(`EduLM students with darsStudentId: ${students.length}`);

  // ── 1. Medical records ──
  const hist = await darsQuery<Record<string, unknown>>(
    `SELECT * FROM Med_History WHERE Id_College=${C}`,
  );
  const online = await darsQuery<Record<string, unknown>>(
    `SELECT o.* FROM Med_HistoryOnline o
     JOIN (SELECT Id_Student, MAX(ID) AS maxId FROM Med_HistoryOnline WHERE Id_College=${C} GROUP BY Id_Student) m
       ON o.ID = m.maxId`,
  );
  const onlineBy = new Map(online.map((r) => [Number(r.Id_Student), r]));

  type Rec = Record<string, unknown>;
  const records = new Map<string, Prisma.StudentMedicalRecordUncheckedCreateInput>();

  const composeAllergies = (h: Rec | undefined, o: Rec | undefined): string => {
    const parts: string[] = [];
    if (o) {
      const flags: Array<[string, string]> = [
        ["Medicamenteuse", "Médicamenteuse"],
        ["Cutanee", "Cutanée"],
        ["Respiratoire", "Respiratoire"],
        ["Alimentaire", "Alimentaire"],
        ["AuxPiquresDinsectes", "Aux piqûres d'insectes"],
      ];
      const on = flags.filter(([k]) => b(o[k])).map(([, label]) => label);
      if (on.length) parts.push(on.join(", "));
      if (b(o.OtherAllergie) && s(o.OtherAllergieDesc)) parts.push(s(o.OtherAllergieDesc));
      if (s(o.Allergies)) parts.push(s(o.Allergies));
      if (s(o.AllergiesMedications)) parts.push(`Médicaments: ${s(o.AllergiesMedications)}`);
    }
    if (h && s(h.Allergies) && !parts.includes(s(h.Allergies))) parts.push(s(h.Allergies));
    return [...new Set(parts)].join(" · ");
  };

  const allDars = new Set<number>([
    ...hist.map((r) => Number(r.Id_Student)),
    ...online.map((r) => Number(r.Id_Student)),
  ]);
  const histBy = new Map(hist.map((r) => [Number(r.Id_Student), r]));
  let skippedRecords = 0;
  for (const sid of allDars) {
    const edu = eduId.get(sid);
    if (!edu) {
      skippedRecords++;
      continue;
    }
    const h = histBy.get(sid);
    const o = onlineBy.get(sid);
    const meds = [s(o?.Medications) || s(h?.Medications), s(o?.NameMedicament), s(o?.MedicamentPendant) || s(h?.MedicamentPendant)]
      .filter(Boolean)
      .join(" · ");
    records.set(edu, {
      tenantId: tenant.id,
      studentId: edu,
      bloodType: s(o?.BloodType) || null,
      diabetic: b(h?.Diabetic) || b(o?.Diabetic),
      asthma: b(h?.Asthma) || b(o?.Asthma),
      epilepsy: b(h?.Epilepsy) || b(o?.Epilepsy),
      scoliosis: b(h?.Scoliosis) || b(o?.Scoliosis),
      favism: b(h?.Favisme) || b(o?.Favisme),
      hemophilia: b(h?.Hemophilie) || b(o?.Hemophilie),
      cardiacProblem: b(h?.ProblemCardiaque) || b(o?.ProblemCardiaque),
      allergies: composeAllergies(h, o) || null,
      medications: meds || null,
      hospitalization: s(o?.Hospitalization) || s(h?.Hospitalization) || null,
      surgeries: s(o?.Surgeries) || s(o?.AntecedantsChirurgicaux) || s(h?.Surgeries) || null,
      majorIllnesses: s(o?.MajorIllnesses) || s(o?.AntecedantsMedicaux) || s(h?.MajorIllnesses) || null,
      chronicIllness: s(o?.MaladieChronique) || null,
      familyHistory: s(o?.FamilyHistory) || s(h?.FamilyHistory) || null,
      specialNeeds: s(o?.SpecialBesoin) || s(h?.SpecialBesoin) || null,
      remarks: [s(h?.Remarks), s(o?.Remarks), s(o?.Precautions)].filter(Boolean).join(" · ") || null,
      pediatricianName: s(h?.Pediatrician_Name) || null,
      pediatricianPhone: s(h?.Pediatrician_Phone) || null,
      allowEmergencyMeasures: nb(o?.AllowEmergencyMesures) ?? nb(h?.AllowEmergencyMesures),
      allowDoctorExam: nb(o?.AllowDoctorExam) ?? nb(h?.AllowDoctorExam),
      allowParacetamol: nb(o?.AllowParacetamol),
      allowMedicalTreatment: nb(o?.AllowMedicalTreatment) ?? nb(h?.AllowMedicalTreatment),
      unfitForSports: b(h?.UnfitForSports) || b(o?.UnfitForSports),
      unfitDuration: s(o?.UnfitDuration) || s(h?.UnfitDuration) || null,
      unfitReason: s(o?.UnfitReason) || s(h?.UnfitReason) || null,
    });
  }

  // ── 2. Immunizations (merge dose-rows per student × vaccine id) ──
  const immRows = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Student, Id_Immunization, IsDone, Description, VaccineMonth, VaccineYear
     FROM Med_Immunizations WHERE Id_College=${C}`,
  );
  type Imm = { done: boolean; notes: string[]; month: number | null; year: number | null };
  const immBy = new Map<string, Map<number, Imm>>();
  let skippedImm = 0;
  for (const r of immRows) {
    const edu = eduId.get(Number(r.Id_Student));
    if (!edu) {
      skippedImm++;
      continue;
    }
    const vid = Number(r.Id_Immunization);
    let m = immBy.get(edu);
    if (!m) {
      m = new Map();
      immBy.set(edu, m);
    }
    const cur = m.get(vid) ?? { done: false, notes: [], month: null, year: null };
    cur.done = cur.done || b(r.IsDone);
    const d = s(r.Description);
    if (d && !cur.notes.includes(d)) cur.notes.push(d);
    const yy = num(r.VaccineYear);
    if (yy && (!cur.year || yy >= cur.year)) {
      cur.year = yy;
      cur.month = num(r.VaccineMonth);
    }
    m.set(vid, cur);
  }
  const immCount = [...immBy.values()].reduce((acc, m) => acc + m.size, 0);

  // ── 3. Visits ──
  const visitRows = await darsQuery<Record<string, unknown>>(
    `SELECT * FROM Med_Visit WHERE Id_College=${C}`,
  );
  const DETAIL_LABELS: Array<[string, string]> = [
    ["Glasses", "Lunettes"],
    ["EyeLenses", "Lentilles"],
    ["Squint", "Strabisme"],
    ["EyesDetails", "Yeux — détails"],
    ["GlueEar", "Otite séreuse"],
    ["Perforation", "Perforation tympan"],
    ["Otitis", "Otite"],
    ["EarsDetails", "Oreilles — détails"],
    ["HearingScreening", "Dépistage auditif"],
    ["Caries", "Caries"],
    ["GlandsProblems", "Ganglions"],
    ["CardiovascularDevice", "Cardiovasculaire"],
    ["Blowing", "Souffle"],
    ["RespiratoryDevice", "Respiratoire"],
    ["Bones", "Os"],
    ["Joints", "Articulations"],
    ["Scoliosis", "Scoliose"],
    ["Abdomen", "Abdomen"],
    ["EctopieTesticulaire", "Ectopie testiculaire"],
    ["Skin", "Peau"],
    ["Hair", "Cheveux"],
    ["SensitivityMedical", "Sensibilité médicamenteuse"],
    ["FoodSensitivity", "Sensibilité alimentaire"],
    ["Poux1", "Poux (1)"],
    ["PouxDate1", "Poux — date 1"],
    ["Poux2", "Poux (2)"],
    ["PouxDate2", "Poux — date 2"],
    ["Classe", "Classe"],
  ];
  type Visit = Prisma.MedicalVisitUncheckedCreateInput;
  const visitsBy = new Map<string, Visit[]>();
  let skippedVisits = 0;
  for (const r of visitRows) {
    const edu = eduId.get(Number(r.Id_Student));
    if (!edu) {
      skippedVisits++;
      continue;
    }
    const rawDate = (r.VisitDate ?? r.TestDate) as Date | null;
    if (!rawDate) continue;
    const details: Record<string, string> = {};
    for (const [col, label] of DETAIL_LABELS) {
      const v = r[col];
      if (v == null || v === false || v === "") continue;
      details[label] = v === true ? "Oui" : v instanceof Date ? v.toISOString().slice(0, 10) : s(v);
    }
    const sy = Number(r.SYear);
    const list = visitsBy.get(edu) ?? [];
    list.push({
      tenantId: tenant.id,
      studentId: edu,
      visitDate: new Date(rawDate),
      yearLabel: Number.isFinite(sy) && sy > 2000 ? `${sy - 1}-${sy}` : null,
      heightCm: num(r.Height),
      weightKg: num(r.Weight),
      bpHigh: s(r.BP_High) || null,
      bpLow: s(r.BP_Low) || null,
      visionOd: s(r.OD) || null,
      visionOg: s(r.OG) || null,
      exam: s(r.Exam) || null,
      plan: s(r.Plann) || null,
      followUp: s(r.FollowUp) || null,
      remarks: s(r.Remarks) || null,
      details,
    });
    visitsBy.set(edu, list);
  }
  const visitCount = [...visitsBy.values()].reduce((acc, l) => acc + l.length, 0);

  console.log(`\nMedical records to upsert: ${records.size} (skipped, unknown student: ${skippedRecords})`);
  console.log(`Immunization rows to upsert: ${immCount} from ${immRows.length} Dars rows (skipped: ${skippedImm})`);
  console.log(`Visits to import: ${visitCount} for ${visitsBy.size} students (skipped: ${skippedVisits})`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to write.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  // ── Write (chunked + retry, connection_limit=1 friendly) ──
  async function chunked<T>(items: T[], label: string, fn: (x: T) => Promise<void>) {
    let done = 0;
    for (let i = 0; i < items.length; i += 5) {
      const chunk = items.slice(i, i + 5);
      for (let attempt = 1; attempt <= 6; attempt++) {
        try {
          await Promise.all(chunk.map(fn));
          done += chunk.length;
          break;
        } catch (e) {
          if (attempt === 6) throw e;
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
      if (done % 250 < 5) console.log(`  ${label}: ${done}/${items.length}`);
    }
  }

  // --only=records|immunizations|visits → redo just one phase (resume after a
  // crash without re-writing the heavy parts).
  const only = arg("only");

  if (!only || only === "records") {
    console.log("\n🔴 Writing records…");
    await chunked([...records.values()], "records", async (rec) => {
      await prisma.studentMedicalRecord.upsert({
        where: { studentId: rec.studentId },
        create: rec,
        update: rec,
      });
    });
  }

  if (!only || only === "immunizations") {
  console.log("Writing immunizations (replace per student)…");
  await chunked([...immBy.entries()], "immunizations", async ([studentId, m]) => {
    await prisma.studentImmunization.deleteMany({ where: { studentId } });
    await prisma.studentImmunization.createMany({
      data: [...m.entries()].map(([vid, imm]) => ({
        tenantId: tenant.id,
        studentId,
        vaccine: VACCINE_NAMES[String(vid)] ?? `Vaccin #${vid}`,
        darsImmunizationId: vid,
        done: imm.done,
        month: imm.month,
        year: imm.year,
        notes: imm.notes.join(" / ") || null,
      })),
    });
  });

  }

  if (!only || only === "visits") {
    console.log("Writing visits (replace per student)…");
    await chunked([...visitsBy.entries()], "visits", async ([studentId, visits]) => {
      await prisma.medicalVisit.deleteMany({ where: { studentId } });
      await prisma.medicalVisit.createMany({ data: visits });
    });
  }

  console.log("\n✓ Medical import complete.");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

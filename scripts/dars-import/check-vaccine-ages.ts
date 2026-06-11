/**
 * Read-only: vaccination-schedule fingerprint per immunization id — median age
 * (months) at each dose across ALL students, dose-count distribution, usage.
 * Vaccine schedules are distinctive (HepB birth/1m/6m · DTC 2/4/6m · ROR
 * 12/18m · HepA 12/18m · Gardasil 11y+ · Tétanos boosters…), so this pins
 * names to ids without guessing.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // dob per dars id
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { not: null }, dob: { not: null } },
    select: { darsStudentId: true, dob: true },
  });
  const dob = new Map(students.map((s) => [Number(s.darsStudentId), s.dob!]));

  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Student, Id_Immunization, Description, VaccineMonth, VaccineYear
     FROM Med_Immunizations WHERE Id_College=${C}`,
  );

  // Extract a date per dose-row: VaccineMonth/Year columns, else first
  // MM-YYYY / DD-MM-YYYY found in Description.
  const dateOf = (r: Record<string, unknown>): { y: number; m: number } | null => {
    const y = Number(r.VaccineYear);
    const m = Number(r.VaccineMonth);
    if (y > 1990) return { y, m: m >= 1 && m <= 12 ? m : 6 };
    const d = String(r.Description ?? "");
    const mt = /(\d{1,2})-(\d{4})/.exec(d) ?? /\d{1,2}-(\d{1,2})-(\d{4})/.exec(d);
    if (mt) {
      const mm = Number(mt[1]);
      const yy = Number(mt[2]);
      if (yy > 1990) return { y: yy, m: mm >= 1 && mm <= 12 ? mm : 6 };
    }
    return null;
  };

  type Stat = { ages: number[]; doses: Map<number, number>; rows: number; students: Set<number> };
  const byId = new Map<number, Stat>();
  const dosesPerStudent = new Map<string, number>();
  for (const r of rows) {
    const id = Number(r.Id_Immunization);
    const sid = Number(r.Id_Student);
    const st: Stat =
      byId.get(id) ?? { ages: [], doses: new Map(), rows: 0, students: new Set<number>() };
    st.rows++;
    st.students.add(sid);
    const k = `${id}|${sid}`;
    dosesPerStudent.set(k, (dosesPerStudent.get(k) ?? 0) + 1);
    const d = dateOf(r);
    const birth = dob.get(sid);
    if (d && birth) {
      const ageMonths = (d.y - birth.getUTCFullYear()) * 12 + (d.m - (birth.getUTCMonth() + 1));
      if (ageMonths >= -3 && ageMonths < 300) st.ages.push(ageMonths);
    }
    byId.set(id, st);
  }
  // dose-count distribution per id
  for (const [k, n] of dosesPerStudent) {
    const id = Number(k.split("|")[0]);
    const st = byId.get(id)!;
    st.doses.set(n, (st.doses.get(n) ?? 0) + 1);
  }

  const med = (a: number[]) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)]!;
  };
  const q = (a: number[], p: number) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length * p)]!;
  };

  console.log("id | élèves | lignes | âge méd. (mois) [q25-q75] | doses/élève (dist)");
  for (const [id, st] of [...byId.entries()].sort((a, b) => a[0] - b[0])) {
    const doseDist = [...st.doses.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([d, n]) => `${d}×${n}`)
      .join(" ");
    console.log(
      `${String(id).padStart(3)} | ${String(st.students.size).padStart(5)} | ${String(st.rows).padStart(5)} | ` +
        `${med(st.ages) ?? "—"} [${q(st.ages, 0.25) ?? "—"}-${q(st.ages, 0.75) ?? "—"}] (${st.ages.length} datées) | ${doseDist}`,
    );
  }
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

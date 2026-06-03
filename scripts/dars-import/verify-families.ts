/**
 * Verify family grouping against the Dars 2026-2027 dashboard:
 *   1 child : 262 families
 *   2 child : 276
 *   3 child : 82
 *   4 child : 10
 *   total   : 1100 students / 630 families
 *
 * Replicates the importer's grouping (family = father→Id_MainParent root,
 * fallback mother/gardian) restricted to the 2026-2027 (SYear 2027) cohort.
 *
 * Run: npx tsx scripts/dars-import/verify-families.ts
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

type S = { ID_Student: number; ID_Father: number | null; ID_Mother: number | null; ID_Gardian: number | null };
type P = { ID_Parent: number; Id_MainParent: number | null };

// Per-year expected histograms from the Dars dashboard.
const EXPECTED: Record<number, { hist: Record<number, number>; registeredOnly: boolean }> = {
  2027: { hist: { 1: 262, 2: 276, 3: 82, 4: 10 }, registeredOnly: false },
  2026: { hist: { 1: 250, 2: 282, 3: 78, 4: 9 }, registeredOnly: true },
};

async function main() {
  const yArg = process.argv.find((a) => a.startsWith("--year="));
  const SY = yArg ? Number(yArg.split("=")[1]) : 2027;
  const cfg = EXPECTED[SY] ?? { hist: {}, registeredOnly: false };
  const regClause = cfg.registeredOnly ? "AND Registered = 1" : "";

  // Cohort students + their parent slots
  const students = await darsQuery<S>(
    `SELECT s.ID_Student, s.ID_Father, s.ID_Mother, s.ID_Gardian
     FROM Isc_Student s
     WHERE s.Id_College = ${C} AND s.ID_Student IN (
       SELECT DISTINCT ID_Student FROM Isc_StudentClass
       WHERE Id_College = ${C} AND SYear = ${SY} ${regClause}
     )`,
  );
  console.log(`Cohort students (SYear ${SY}${cfg.registeredOnly ? ", Registered=1" : ""}): ${students.length}`);

  // All referenced parents → Id_MainParent
  const pids = new Set<number>();
  for (const s of students) for (const id of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) if (id && id > 0) pids.add(Number(id));
  const parents = await darsQuery<P>(
    `SELECT ID_Parent, Id_MainParent FROM Isc_Parent
     WHERE Id_College = ${C} AND ID_Parent IN (${[...pids].join(",") || "-1"})`,
  );
  const mainOf = new Map<number, number>();
  for (const p of parents) {
    mainOf.set(Number(p.ID_Parent), p.Id_MainParent && Number(p.Id_MainParent) > 0 ? Number(p.Id_MainParent) : Number(p.ID_Parent));
  }

  // Each student → family root (father, then mother, then gardian)
  const studentsPerFamily = new Map<number, number>();
  let unresolved = 0;
  for (const s of students) {
    let root: number | null = null;
    for (const slot of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) {
      if (slot && Number(slot) > 0 && mainOf.has(Number(slot))) {
        root = mainOf.get(Number(slot))!;
        break;
      }
    }
    if (root == null) { unresolved++; continue; }
    studentsPerFamily.set(root, (studentsPerFamily.get(root) ?? 0) + 1);
  }

  // Histogram: how many families have N children
  const hist = new Map<number, number>();
  for (const n of studentsPerFamily.values()) hist.set(n, (hist.get(n) ?? 0) + 1);

  const expected: Record<number, number> = cfg.hist;
  const expTotalFamilies = Object.values(expected).reduce((a, b) => a + b, 0);
  const rows: Array<Record<string, unknown>> = [];
  const maxN = Math.max(...hist.keys(), 4);
  for (let n = 1; n <= maxN; n++) {
    const got = hist.get(n) ?? 0;
    const exp = expected[n];
    rows.push({
      children: n,
      myFamilies: got,
      darsDashboard: exp ?? "—",
      match: exp === undefined ? "" : got === exp ? "✓" : `✗ (${got - exp})`,
    });
  }
  console.table(rows);

  const totalFamilies = studentsPerFamily.size;
  const totalStudents = [...studentsPerFamily.values()].reduce((a, b) => a + b, 0);
  console.log(`\nTotal families: ${totalFamilies}  (dashboard: ${expTotalFamilies})  ${totalFamilies === expTotalFamilies ? "✓" : "✗"}`);
  console.log(`Total students: ${totalStudents}  (dashboard: ${students.length}) ${totalStudents === students.length ? "✓" : "✗"}`);
  if (unresolved) console.log(`⚠ Unresolved (no parent slot found): ${unresolved}`);

  await closeDars();
}

main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });

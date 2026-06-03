/**
 * Reconcile "students this year" against the Dars dashboard (1084).
 * Tries every plausible filter combination on Isc_StudentClass.
 * Run: npx tsx scripts/dars-import/reconcile.ts
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

const C = 108;

async function main() {
  for (const sy of [2026, 2027]) {
    console.log(`\n========== SYear ${sy} (${sy - 1}-${sy}) ==========`);
    const combos: Array<[string, string]> = [
      ["all rows", "1=1"],
      ["Registered=1", "Registered = 1"],
      ["HasLeft=0", "(HasLeft = 0 OR HasLeft IS NULL)"],
      ["Registered=1 AND HasLeft=0", "Registered = 1 AND (HasLeft = 0 OR HasLeft IS NULL)"],
      ["DNR<>'1' (not Do-Not-Return)", "(DNR IS NULL OR DNR <> '1')"],
      ["Registered=1 AND HasLeft=0 AND DNR<>'1'", "Registered = 1 AND (HasLeft = 0 OR HasLeft IS NULL) AND (DNR IS NULL OR DNR <> '1')"],
    ];
    const rows: Array<Record<string, unknown>> = [];
    for (const [label, where] of combos) {
      const r = await darsQuery<{ n: number; s: number }>(
        `SELECT COUNT(*) AS n, COUNT(DISTINCT ID_Student) AS s
         FROM Isc_StudentClass
         WHERE Id_College = ${C} AND SYear = ${sy} AND ${where}`,
      );
      rows.push({ filter: label, rows: Number(r[0]!.n), distinctStudents: Number(r[0]!.s) });
    }
    console.table(rows);
  }

  // Are there duplicate enrollments (same student twice in a year)?
  console.log("\n=== Students with >1 enrollment row in SYear 2026 (duplicates) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 10 ID_Student, COUNT(*) AS rows_for_student
       FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear = 2026
       GROUP BY ID_Student HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC`,
    ),
  );

  // Distinct values of the filter columns so we understand the data
  console.log("\n=== HasLeft / Registered / DNR distributions (SYear 2026) ===");
  console.table(
    await darsQuery(
      `SELECT 'HasLeft' AS col, CAST(HasLeft AS varchar) AS val, COUNT(*) AS n
       FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear = 2026 GROUP BY HasLeft
       UNION ALL
       SELECT 'Registered', CAST(Registered AS varchar), COUNT(*)
       FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear = 2026 GROUP BY Registered
       UNION ALL
       SELECT 'DNR', DNR, COUNT(*)
       FROM Isc_StudentClass WHERE Id_College = ${C} AND SYear = 2026 GROUP BY DNR
       ORDER BY col, val`,
    ),
  );

  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

/**
 * Read-only: confirm how Isc_TmpClasse_Choices.Id_TmpStudent links to a real
 * student + year, and show real examples with their chosen languages/options/
 * spécialités. Tests join on Isc_TmpStudent.ID_Student.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const ranges = await darsQuery<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM Isc_TmpClasse_Choices WHERE Id_College=${C}) AS choices,
       (SELECT MIN(Id_TmpStudent) FROM Isc_TmpClasse_Choices WHERE Id_College=${C}) AS minLink,
       (SELECT MAX(Id_TmpStudent) FROM Isc_TmpClasse_Choices WHERE Id_College=${C}) AS maxLink,
       (SELECT MIN(ID_Student) FROM Isc_TmpStudent WHERE Id_College=${C}) AS minStud,
       (SELECT MAX(ID_Student) FROM Isc_TmpStudent WHERE Id_College=${C}) AS maxStud,
       (SELECT COUNT(*) FROM Isc_TmpClasse_Choices c
          JOIN Isc_TmpStudent t ON c.Id_TmpStudent = t.ID_Student
          WHERE c.Id_College=${C}) AS joinOnIdStudent`,
  );
  console.log("Linkage test:");
  console.table(ranges);

  console.log("\n=== Real students with choices (join on ID_Student) ===");
  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 16 t.ID_Student, t.SYear, t.FirstName, t.LastName, t.Id_ClassCode, c.*
     FROM Isc_TmpClasse_Choices c
     JOIN Isc_TmpStudent t ON c.Id_TmpStudent = t.ID_Student
     WHERE c.Id_College=${C}
     ORDER BY t.SYear DESC, t.ID_Student`,
  );
  for (const row of rows) {
    const set = Object.entries(row)
      .filter(([k, v]) => (v === true || v === 1) && /^(SEC|PREM|TLE)_/.test(k))
      .map(([k]) => k);
    console.log(
      `   ${row.FirstName} ${row.LastName} (ID ${row.ID_Student}, SYear ${row.SYear}, class ${row.Id_ClassCode}) → [${set.join(", ")}]`,
    );
  }

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

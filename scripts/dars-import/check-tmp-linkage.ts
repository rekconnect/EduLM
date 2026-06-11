/**
 * CRITICAL read-only check: does Isc_TmpStudent.ID_Student equal the master
 * Isc_Student.ID_Student (so darsStudentId matching is valid), or is it a
 * draft-local id (making earlier id-based Tmp matching WRONG)? Compares names
 * joined by ID_Student vs by StudentCode.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

const norm = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

async function main() {
  console.log("=== A. Join Isc_TmpStudent → Isc_Student ON ID_Student (name compare) ===");
  const a = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 15 t.ID_Student, t.StudentCode AS tCode, t.FirstName AS tF, t.LastName AS tL,
            s.FirstName AS sF, s.LastName AS sL, s.StudentCode AS sCode
     FROM Isc_TmpStudent t
     LEFT JOIN Isc_Student s ON t.ID_Student = s.ID_Student AND s.Id_College=${C}
     WHERE t.Id_College=${C} ORDER BY t.ID_Student`,
  );
  for (const r of a) {
    const match = norm(r.tF) + norm(r.tL) === norm(r.sF) + norm(r.sL);
    console.log(
      `   tmp#${r.ID_Student} "${r.tF} ${r.tL}" (code ${r.tCode})  vs master "${r.sF ?? "—"} ${r.sL ?? ""}" (code ${r.sCode ?? "—"})  ${r.sF ? (match ? "✓ same" : "✗ DIFFERENT") : "(no master row)"}`,
    );
  }

  console.log("\n=== B. Join Isc_TmpStudent → Isc_Student ON StudentCode (name compare) ===");
  const b = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 15 t.ID_Student AS tmpId, t.StudentCode, t.FirstName AS tF, t.LastName AS tL,
            s.ID_Student AS realId, s.FirstName AS sF, s.LastName AS sL
     FROM Isc_TmpStudent t
     JOIN Isc_Student s ON t.StudentCode = s.StudentCode AND s.Id_College=${C}
     WHERE t.Id_College=${C} ORDER BY t.ID_Student`,
  );
  for (const r of b) {
    const match = norm(r.tF) + norm(r.tL) === norm(r.sF) + norm(r.sL);
    console.log(
      `   tmpId ${r.tmpId} (code ${r.StudentCode}) "${r.tF} ${r.tL}"  →  realId ${r.realId} "${r.sF} ${r.sL}"  ${match ? "✓ same" : "✗ DIFFERENT"}`,
    );
  }

  console.log("\n=== Counts ===");
  const counts = await darsQuery<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(*) FROM Isc_TmpStudent WHERE Id_College=${C}) AS tmpTotal,
       (SELECT COUNT(*) FROM Isc_TmpStudent t JOIN Isc_Student s ON t.ID_Student=s.ID_Student AND s.Id_College=${C}
          WHERE t.Id_College=${C} AND LOWER(t.FirstName+t.LastName)=LOWER(s.FirstName+s.LastName)) AS sameNameById,
       (SELECT COUNT(*) FROM Isc_TmpStudent t JOIN Isc_Student s ON t.StudentCode=s.StudentCode AND s.Id_College=${C}
          WHERE t.Id_College=${C}) AS joinByCode,
       (SELECT COUNT(*) FROM Isc_TmpStudent t JOIN Isc_Student s ON t.StudentCode=s.StudentCode AND s.Id_College=${C}
          WHERE t.Id_College=${C} AND LOWER(t.FirstName+t.LastName)=LOWER(s.FirstName+s.LastName)) AS sameNameByCode`,
  );
  console.table(counts);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

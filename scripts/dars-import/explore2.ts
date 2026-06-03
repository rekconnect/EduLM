/**
 * Family-grouping + scope exploration. Throwaway.
 * Run: npx tsx scripts/dars-import/explore2.ts
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Which SYear is current? (Actual / Registration) ===");
  console.table(
    await darsQuery(
      `SELECT SYear, SchoolYear, Actual, Registration FROM Isc_SchoolYear WHERE Id_College = 108 ORDER BY SYear DESC`,
    ),
  );

  console.log("\n=== Enrollment counts per SYear (last 10) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 10 SYear, COUNT(*) AS enrollments, COUNT(DISTINCT ID_Student) AS students
       FROM Isc_StudentClass WHERE Id_College = 108
       GROUP BY SYear ORDER BY SYear DESC`,
    ),
  );

  console.log("\n=== Do mothers' Id_MainParent point to the father? (student 1: father 129, mother 12613) ===");
  console.table(
    await darsQuery(
      `SELECT ID_Parent, FirstName, LastName, Id_MainParent
       FROM Isc_Parent WHERE Id_College = 108 AND ID_Parent IN (129, 12613, 73, 12557, 351, 12832)
       ORDER BY ID_Parent`,
    ),
  );

  console.log("\n=== How often does Gardian differ from BOTH father and mother? ===");
  console.table(
    await darsQuery(
      `SELECT
         SUM(CASE WHEN ID_Gardian = ID_Father THEN 1 ELSE 0 END) AS gardian_is_father,
         SUM(CASE WHEN ID_Gardian = ID_Mother THEN 1 ELSE 0 END) AS gardian_is_mother,
         SUM(CASE WHEN ID_Gardian <> ID_Father AND ID_Gardian <> ID_Mother THEN 1 ELSE 0 END) AS gardian_is_other,
         COUNT(*) AS total
       FROM Isc_Student WHERE Id_College = 108`,
    ),
  );

  console.log("\n=== Distinct (Father,Mother) pairs vs total students (sibling grouping) ===");
  console.table(
    await darsQuery(
      `SELECT COUNT(*) AS total_students,
              COUNT(DISTINCT CAST(ID_Father AS varchar)+'-'+CAST(ID_Mother AS varchar)) AS distinct_father_mother_pairs
       FROM Isc_Student WHERE Id_College = 108`,
    ),
  );

  console.log("\n=== STUDENTS IN SCOPE: enrolled in SYear >= 2021 (last 5 yrs incl current) ===");
  console.table(
    await darsQuery(
      `SELECT COUNT(DISTINCT ID_Student) AS students_in_scope
       FROM Isc_StudentClass WHERE Id_College = 108 AND SYear >= 2021`,
    ),
  );

  console.log("\n=== CURRENT roster: students enrolled in the Actual year ===");
  console.table(
    await darsQuery(
      `SELECT sc.SYear, COUNT(DISTINCT sc.ID_Student) AS students
       FROM Isc_StudentClass sc
       JOIN Isc_SchoolYear sy ON sy.SYear = sc.SYear AND sy.Id_College = sc.Id_College
       WHERE sc.Id_College = 108 AND sy.Actual = 1
       GROUP BY sc.SYear`,
    ),
  );

  console.log("\n=== Isc_Classes sample (for Phase 2 matching to seeded EduLM classes) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 15 ID_Class, ClassName, ClassNameAr, Id_Division, SYear
       FROM Isc_Classes WHERE Id_College = 108 ORDER BY SYear DESC, ID_Class`,
    ),
  );

  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

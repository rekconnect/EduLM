/**
 * Ad-hoc exploration to resolve the open mapping questions. Throwaway.
 * Run: npx tsx scripts/dars-import/explore.ts
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  console.log("=== TIT (Titre) codes — drive Guardian.relation ===");
  console.table(
    await darsQuery(
      `SELECT ID, Code, CodeValue, CodeValueEn FROM Isc_Codes WHERE Id_College = 108 AND CodeType = 'TIT' ORDER BY ID`,
    ),
  );

  console.log("\n=== RELAT (Lien de parenté) codes ===");
  console.table(
    await darsQuery(
      `SELECT ID, Code, CodeValue, CodeValueEn FROM Isc_Codes WHERE Id_College = 108 AND CodeType = 'RELAT' ORDER BY ID`,
    ),
  );

  console.log("\n=== NAT codes containing 'Liban' (find the Lebanese code id) ===");
  console.table(
    await darsQuery(
      `SELECT ID, Code, CodeValue, CodeValueEn FROM Isc_Codes
       WHERE Id_College = 108 AND CodeType = 'NAT'
         AND (CodeValue LIKE '%iban%' OR CodeValueEn LIKE '%eban%')
       ORDER BY ID`,
    ),
  );

  console.log("\n=== SIT (Situation Famille) — drives monoParental ===");
  console.table(
    await darsQuery(
      `SELECT ID, Code, CodeValue, CodeValueEn FROM Isc_Codes WHERE Id_College = 108 AND CodeType = 'SIT' ORDER BY ID`,
    ),
  );

  console.log("\n=== Isc_Parent sample (resolved title + nationality) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 8
         p.ID_Parent, p.FirstName, p.LastName,
         t.CodeValue AS Title,
         n1.CodeValue AS Nation1, n2.CodeValue AS Nation2,
         sit.CodeValue AS FamilySituation,
         p.Id_FamilyType, p.IsDead, p.Divorced, p.Id_MainParent, p.Actual,
         p.Email, p.RegisterNum
       FROM Isc_Parent p
       LEFT JOIN Isc_Codes t   ON t.ID = p.Id_Title          AND t.CodeType='TIT'
       LEFT JOIN Isc_Codes n1  ON n1.ID = p.Id_Nation1       AND n1.CodeType='NAT'
       LEFT JOIN Isc_Codes n2  ON n2.ID = p.Id_Nation2       AND n2.CodeType='NAT'
       LEFT JOIN Isc_Codes sit ON sit.ID = p.Id_FamilySituation AND sit.CodeType='SIT'
       WHERE p.Id_College = 108
       ORDER BY p.ID_Parent`,
    ),
  );

  console.log("\n=== Family-situation distribution across all parents ===");
  console.table(
    await darsQuery(
      `SELECT sit.CodeValue AS FamilySituation, COUNT(*) AS n
       FROM Isc_Parent p
       LEFT JOIN Isc_Codes sit ON sit.ID = p.Id_FamilySituation AND sit.CodeType='SIT'
       WHERE p.Id_College = 108
       GROUP BY sit.CodeValue ORDER BY n DESC`,
    ),
  );

  console.log("\n=== Phone-type values in use ===");
  console.table(
    await darsQuery(
      `SELECT Id_Type, COUNT(*) AS n FROM Isc_ParentPhone WHERE Id_College = 108 GROUP BY Id_Type ORDER BY Id_Type`,
    ),
  );

  console.log("\n=== Isc_Student sample (resolved nationality) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 8
         s.ID_Student, s.FirstName, s.LastName, s.Gender, s.DateOfBirth, s.BirthPlace,
         n1.CodeValue AS Nation1, s.IdNumber, s.RegisterNum,
         s.IsExclArabic, s.IsExclSport, s.Particle,
         s.ID_Father, s.ID_Mother, s.ID_Gardian
       FROM Isc_Student s
       LEFT JOIN Isc_Codes n1 ON n1.ID = s.Id_Nation1 AND n1.CodeType='NAT'
       WHERE s.Id_College = 108
       ORDER BY s.ID_Student`,
    ),
  );

  console.log("\n=== Gender distinct values ===");
  console.table(
    await darsQuery(
      `SELECT Gender, COUNT(*) AS n FROM Isc_Student WHERE Id_College = 108 GROUP BY Gender`,
    ),
  );

  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

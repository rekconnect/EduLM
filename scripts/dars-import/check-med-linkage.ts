/**
 * Read-only: verify Med_* tables link to REAL Isc_Student ids (not draft-local
 * like Isc_TmpStudent), find the vaccine-name lookup, and sample real data.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  // Id-space sanity: Med ids should join the master student table.
  const sanity = await darsQuery<Record<string, unknown>>(
    `SELECT
       (SELECT COUNT(DISTINCT Id_Student) FROM Med_History WHERE Id_College=${C}) AS histStudents,
       (SELECT COUNT(DISTINCT h.Id_Student) FROM Med_History h
          JOIN Isc_Student s ON h.Id_Student=s.ID_Student AND s.Id_College=${C}
          WHERE h.Id_College=${C}) AS histInMaster,
       (SELECT COUNT(DISTINCT Id_Student) FROM Med_Visit WHERE Id_College=${C}) AS visitStudents,
       (SELECT COUNT(DISTINCT v.Id_Student) FROM Med_Visit v
          JOIN Isc_Student s ON v.Id_Student=s.ID_Student AND s.Id_College=${C}
          WHERE v.Id_College=${C}) AS visitInMaster,
       (SELECT COUNT(DISTINCT Id_Student) FROM Med_Immunizations WHERE Id_College=${C}) AS immStudents,
       (SELECT COUNT(DISTINCT i.Id_Student) FROM Med_Immunizations i
          JOIN Isc_Student s ON i.Id_Student=s.ID_Student AND s.Id_College=${C}
          WHERE i.Id_College=${C}) AS immInMaster,
       (SELECT COUNT(DISTINCT Id_Student) FROM Med_HistoryOnline WHERE Id_College=${C}) AS onlStudents,
       (SELECT COUNT(DISTINCT o.Id_Student) FROM Med_HistoryOnline o
          JOIN Isc_Student s ON o.Id_Student=s.ID_Student AND s.Id_College=${C}
          WHERE o.Id_College=${C}) AS onlInMaster`,
  );
  console.log("Linkage (xInMaster should equal xStudents):");
  console.table(sanity);

  // Name sanity on a couple of rows with allergies.
  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 5 s.FirstName, s.LastName, h.Allergies, h.Asthma, h.Diabetic
     FROM Med_History h JOIN Isc_Student s ON h.Id_Student=s.ID_Student AND s.Id_College=${C}
     WHERE h.Id_College=${C} AND h.Allergies IS NOT NULL AND LTRIM(RTRIM(h.Allergies))<>''`,
  );
  console.log("\nSample histories with allergies:");
  for (const r of sample)
    console.log(`  ${r.FirstName} ${r.LastName}: allergies="${r.Allergies}" asthma=${r.Asthma} diab=${r.Diabetic}`);

  // Vaccine lookup: Med_Lists types.
  const types = await darsQuery<Record<string, unknown>>(
    `SELECT ID, Code, DescriptionFr FROM Med_ListsTypes WHERE Id_College=${C} ORDER BY ID`,
  );
  console.log("\nMed_ListsTypes:");
  for (const t of types) console.log(`  ${t.ID}: ${t.Code} — ${t.DescriptionFr}`);

  const lists = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 30 ID, ValueName, Type FROM Med_Lists WHERE Id_College=${C} ORDER BY Type, ValueRank`,
  );
  console.log("\nMed_Lists (first 30):");
  for (const l of lists) console.log(`  ${l.ID} [type ${l.Type}]: ${l.ValueName}`);

  // Which list type do Id_Immunization values point to?
  const immJoin = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 8 i.Id_Immunization, l.ValueName, l.Type, COUNT(*) AS n
     FROM Med_Immunizations i LEFT JOIN Med_Lists l ON i.Id_Immunization=l.ID
     WHERE i.Id_College=${C}
     GROUP BY i.Id_Immunization, l.ValueName, l.Type ORDER BY n DESC`,
  );
  console.log("\nTop immunizations (joined to Med_Lists):");
  for (const r of immJoin) console.log(`  id=${r.Id_Immunization} → "${r.ValueName}" (type ${r.Type}) ×${r.n}`);

  // Visit year semantics.
  const vy = await darsQuery<Record<string, unknown>>(
    `SELECT SYear, COUNT(*) AS n FROM Med_Visit WHERE Id_College=${C} GROUP BY SYear ORDER BY SYear DESC`,
  );
  console.log("\nMed_Visit per SYear:");
  console.table(vy);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

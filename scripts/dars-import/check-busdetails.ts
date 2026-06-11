/** Read-only: sample BusDetails values (latest filled year) to learn the format. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const r = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 30 sc.SYear, s.FirstName, s.LastName, sc.BusDetails
     FROM Isc_StudentClass sc
     JOIN Isc_Student s ON sc.ID_Student = s.ID_Student AND s.Id_College=${C}
     WHERE sc.Id_College=${C} AND sc.SYear=2025
       AND sc.BusDetails IS NOT NULL AND LTRIM(RTRIM(sc.BusDetails)) <> ''
     ORDER BY sc.ID`,
  );
  for (const x of r) console.log(`${x.LastName} ${x.FirstName} -> ${JSON.stringify(x.BusDetails)}`);

  // Distinct value census to understand the vocabulary.
  const census = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 30 BusDetails, COUNT(*) AS n
     FROM Isc_StudentClass WHERE Id_College=${C} AND SYear IN (2024, 2025)
       AND BusDetails IS NOT NULL AND LTRIM(RTRIM(BusDetails)) <> ''
     GROUP BY BusDetails ORDER BY n DESC`,
  );
  console.log("\nMost common values (2023-2025):");
  for (const x of census) console.log(`  ×${x.n}  ${JSON.stringify(x.BusDetails)}`);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

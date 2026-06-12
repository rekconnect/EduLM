/** Read-only: Trs_Circuit structure — how are activity circuits marked in 2026? */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const cols = await darsQuery<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Trs_Circuit' ORDER BY ORDINAL_POSITION`,
  );
  console.log("Trs_Circuit:", cols.map((c) => c.COLUMN_NAME).join(", "));

  const byAct = await darsQuery<Record<string, unknown>>(
    `SELECT c.Id_Activite, a.Description AS activite, COUNT(*) AS circuits,
            (SELECT COUNT(*) FROM Trs_Eleve_Station es WHERE es.Id_College=${C} AND es.Id_Circuit IN
              (SELECT c2.ID FROM Trs_Circuit c2 WHERE c2.Id_College=${C} AND c2.Annee=2026 AND ISNULL(c2.Id_Activite,0)=ISNULL(c.Id_Activite,0))
            ) AS station_rows
     FROM Trs_Circuit c
     LEFT JOIN Trs_Activite a ON a.ID = c.Id_Activite
     WHERE c.Id_College=${C} AND c.Annee=2026
     GROUP BY c.Id_Activite, a.Description ORDER BY c.Id_Activite`,
  ).catch(async (e) => {
    console.log("(variant failed: " + String(e).slice(0, 120) + ")");
    return darsQuery<Record<string, unknown>>(
      `SELECT Id_Activite, COUNT(*) AS circuits FROM Trs_Circuit
       WHERE Id_College=${C} AND Annee=2026 GROUP BY Id_Activite ORDER BY Id_Activite`,
    );
  });
  console.table(byAct);

  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 40 ID, Numero, Id_Activite, Id_Session FROM Trs_Circuit
     WHERE Id_College=${C} AND Annee=2026 ORDER BY Id_Activite, Numero`,
  );
  console.table(sample);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

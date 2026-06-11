/** Read-only: full Trs tariff grid (incl. activity columns), sessions, and
 *  current-session Trs_Eleve_Station volumes. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Grille tarifaire par zone (Trs_Tarif_Zone_Vers) ===");
  const grid = await darsQuery<Record<string, unknown>>(
    `SELECT ID_Zone, Id_Versement, Tarif, TarifAS, TarifRS,
            Tarif_AR_Activity, Tarif_AS_Activity, Tarif_RS_Activity, AddedDate
     FROM Trs_Tarif_Zone_Vers WHERE Id_College=${C} ORDER BY Id_Versement, ID_Zone`,
  );
  console.table(grid);

  console.log("\n=== Sessions / années dans Trs_Eleve_Station ===");
  const sess = await darsQuery<Record<string, unknown>>(
    `SELECT es.Id_Session, COUNT(*) AS rows,
            SUM(CASE WHEN es.Flag_Desistement=1 THEN 1 ELSE 0 END) AS desistements,
            MIN(c.Annee) AS annee
     FROM Trs_Eleve_Station es
     LEFT JOIN Trs_Circuit c ON c.Id_Session = es.Id_Session AND c.Id_College=${C} AND c.ID = es.Id_Circuit
     WHERE es.Id_College=${C}
     GROUP BY es.Id_Session ORDER BY MIN(c.Annee) DESC, es.Id_Session DESC`,
  );
  console.table(sess);

  console.log("\n=== Circuits de la dernière année ===");
  const circ = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 30 ID, Annee, Numero, Id_Activite, Id_Session FROM Trs_Circuit
     WHERE Id_College=${C} ORDER BY Annee DESC, Numero ASC`,
  );
  console.table(circ);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

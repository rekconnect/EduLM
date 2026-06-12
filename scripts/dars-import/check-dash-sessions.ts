/** Read-only: how do Trs sessions map to 2025-2026, and which population
 *  gives the dashboard's 507 / 373 / 477 / $155,960? */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'Trs[_]%' ORDER BY TABLE_NAME`,
  );
  console.log("Trs tables:", tbls.map((t) => t.TABLE_NAME).join(", "));

  // Session table if it exists.
  const hasSession = tbls.some((t) => t.TABLE_NAME === "Trs_Session");
  if (hasSession) {
    const cols = await darsQuery<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Trs_Session' ORDER BY ORDINAL_POSITION`,
    );
    console.log("\nTrs_Session cols:", cols.map((c) => c.COLUMN_NAME).join(", "));
    const rows = await darsQuery<Record<string, unknown>>(
      `SELECT TOP 12 * FROM Trs_Session WHERE Id_College=${C} ORDER BY 1 DESC`,
    );
    for (const r of rows) console.log("  ", JSON.stringify(r).slice(0, 220));
  }

  console.log("\n=== Stats par session (3 dernières années) ===");
  const stats = await darsQuery<Record<string, unknown>>(
    `SELECT es.Id_Session, MIN(c.Annee) AS annee, COUNT(*) AS rows,
            COUNT(DISTINCT es.Id_Eleve) AS eleves,
            SUM(CASE WHEN es.Type_Trajet='AR' THEN 1 ELSE 0 END) AS ar,
            SUM(CASE WHEN es.Type_Trajet='AS' THEN 1 ELSE 0 END) AS as_,
            SUM(CASE WHEN es.Type_Trajet='RS' THEN 1 ELSE 0 END) AS rs,
            SUM(CASE WHEN es.Flag_Desistement=1 THEN 1 ELSE 0 END) AS desist
     FROM Trs_Eleve_Station es
     LEFT JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit
     WHERE es.Id_College=${C}
     GROUP BY es.Id_Session
     HAVING MIN(c.Annee) >= '2023'
     ORDER BY MIN(c.Annee) DESC, es.Id_Session DESC`,
  );
  console.table(stats);

  console.log("\n=== Facturation transport 2025-2026 (Fct_Eleve_Tarif liés à une station de session 2709) ===");
  const bill = await darsQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT f.Id_Eleve) AS eleves,
            SUM(f.Montant) AS montant, SUM(f.Net) AS net,
            SUM(CASE WHEN f.Flag_Desistement=1 THEN 1 ELSE 0 END) AS desist
     FROM Fct_Eleve_Tarif f
     JOIN Trs_Eleve_Station es ON es.ID = f.Id_Eleve_Station AND es.Id_College=${C}
     WHERE f.Id_College=${C} AND es.Id_Session=2709`,
  );
  console.table(bill);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

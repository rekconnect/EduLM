/** Read-only: billing header (entete/versement) structure behind transport rows. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_TYPE='BASE TABLE' AND (TABLE_NAME LIKE '%Entete%' OR TABLE_NAME LIKE 'Fct[_]%')
     ORDER BY TABLE_NAME`,
  );
  console.log("Tables:", tbls.map((t) => t.TABLE_NAME).join(", "));

  // Which entetes carry the 2025-2026 transport rows?
  const ent = await darsQuery<Record<string, unknown>>(
    `SELECT f.ID_Entete, COUNT(*) AS rows, COUNT(DISTINCT f.Id_Eleve) AS eleves,
            SUM(f.Montant) AS montant, SUM(f.Net) AS net,
            MIN(f.Quand) AS d1, MAX(f.Quand) AS d2
     FROM Fct_Eleve_Tarif f
     JOIN Trs_Eleve_Station es ON es.ID=f.Id_Eleve_Station AND es.Id_College=${C}
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=2026
     WHERE f.Id_College=${C} AND f.Quand >= '2025-08-01'
     GROUP BY f.ID_Entete ORDER BY f.ID_Entete`,
  );
  console.table(ent);

  // Describe those entetes from the header table (try common names).
  for (const t of tbls.map((x) => x.TABLE_NAME).filter((n) => /entete/i.test(n))) {
    const cols = await darsQuery<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n${t}: ${cols.map((c) => c.COLUMN_NAME).join(", ")}`);
    const ids = ent.map((e) => e.ID_Entete).filter((x) => x != null);
    if (ids.length && cols.some((c) => c.COLUMN_NAME === "ID")) {
      const rows = await darsQuery<Record<string, unknown>>(
        `SELECT * FROM [${t}] WHERE ID IN (${ids.join(",")})`,
      ).catch((e) => [{ err: String(e).slice(0, 150) }] as Record<string, unknown>[]);
      for (const r of rows) console.log("  ", JSON.stringify(r).slice(0, 300));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

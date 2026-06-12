/** Read-only: columns + samples of the tables behind the Dars transport
 *  dashboard (Trs_Eleve_Station + Fct_Eleve_Tarif) and session-2709 volume. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  for (const t of ["Trs_Eleve_Station", "Fct_Eleve_Tarif"]) {
    const cols = await darsQuery<{ COLUMN_NAME: string; DATA_TYPE: string }>(
      `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
    );
    console.log(`\n=== ${t} ===`);
    console.log(cols.map((c) => `${c.COLUMN_NAME}:${c.DATA_TYPE}`).join(", "));
    const sample = await darsQuery<Record<string, unknown>>(`SELECT TOP 3 * FROM [${t}] WHERE Id_College=${C}`);
    for (const r of sample) console.log("  ", JSON.stringify(r).slice(0, 260));
  }

  console.log("\n=== Session 2709 (2025-2026) volumes ===");
  const v = await darsQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT Id_Eleve) AS eleves,
            SUM(CASE WHEN Flag_Desistement=1 THEN 1 ELSE 0 END) AS desist
     FROM Trs_Eleve_Station WHERE Id_College=${C} AND Id_Session=2709`,
  ).catch((e) => [{ err: String(e).slice(0, 200) }]);
  console.table(v);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

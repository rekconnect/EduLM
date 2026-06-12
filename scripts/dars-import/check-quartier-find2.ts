/** Read-only: hunt the table behind Trs_Eleve_Station.Id_Quartier (ids 54, 341, 611, 1414). */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  // Tables having both an ID col and a name-ish col, small enough to be a code list.
  const cand = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT c.TABLE_NAME, c.COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS c
     WHERE c.COLUMN_NAME IN ('Libelle','Description','Nom','Name','Quartier','Town','Village')
       AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS i WHERE i.TABLE_NAME=c.TABLE_NAME AND i.COLUMN_NAME='ID')
     ORDER BY c.TABLE_NAME`,
  );
  const seen = new Set<string>();
  for (const { TABLE_NAME, COLUMN_NAME } of cand) {
    const key = TABLE_NAME;
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = await darsQuery<Record<string, unknown>>(
      `SELECT ID, [${COLUMN_NAME}] AS label FROM [${TABLE_NAME}] WHERE ID IN (54, 341, 611, 1414)`,
    ).catch(() => []);
    if (rows.length >= 2) {
      console.log(`${TABLE_NAME}.${COLUMN_NAME}:`);
      for (const r of rows) console.log("  ", JSON.stringify(r));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

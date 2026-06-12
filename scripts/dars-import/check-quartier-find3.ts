/** Read-only: is Id_Quartier an Isc_Codes id? Otherwise scan ALL tables for
 *  a (ID, varchar) pair where the 4 ids resolve to plausible quartier names. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const isc = await darsQuery<Record<string, unknown>>(
    `SELECT ID, CodeType, Code, CodeValue FROM Isc_Codes WHERE ID IN (54,341,611,1414)`,
  );
  console.log("Isc_Codes hits:");
  for (const r of isc) console.log("  ", JSON.stringify(r));

  // What quartier names do we EXPECT? Take billed students WITH known quartiers
  // from the tarif file (EduLM zone_*) — e.g. Bekfaya for Khoury Ayla (station
  // "Bekfaya main road"). Scan code-like tables for 'Bekfaya'.
  const tables = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT c.TABLE_NAME, c.COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS c
     JOIN INFORMATION_SCHEMA.COLUMNS i ON i.TABLE_NAME=c.TABLE_NAME AND i.COLUMN_NAME='ID'
     WHERE c.DATA_TYPE IN ('varchar','nvarchar') AND c.COLUMN_NAME NOT IN ('Qui','Quoi','Ou')
     ORDER BY c.TABLE_NAME`,
  );
  const tried = new Set<string>();
  for (const { TABLE_NAME, COLUMN_NAME } of tables) {
    const key = `${TABLE_NAME}.${COLUMN_NAME}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const hit = await darsQuery<Record<string, unknown>>(
      `SELECT TOP 3 ID, [${COLUMN_NAME}] AS label FROM [${TABLE_NAME}]
       WHERE [${COLUMN_NAME}] LIKE '%ekfaya%'`,
    ).catch(() => []);
    if (hit.length) {
      console.log(`${key}:`);
      for (const r of hit) console.log("  ", JSON.stringify(r).slice(0, 160));
    }
  }
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

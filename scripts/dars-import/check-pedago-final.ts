/**
 * Read-only: hunt for a FINALIZED source of the pedagogical choices (languages
 * / options / spécialités) keyed by the REAL student id — a non-Tmp twin of
 * Isc_TmpClasse_Choices, a per-class choices table, or columns on
 * Isc_StudentClass.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function cols(table: string) {
  const r = await darsQuery<{ COLUMN_NAME: string; DATA_TYPE: string }>(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME='${table}' ORDER BY ORDINAL_POSITION`,
  ).catch(() => []);
  if (r.length === 0) return;
  const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${table}]`).catch(() => [{ n: -1 }]);
  console.log(`\n=== ${table} — ${r.length} cols, rows≈${n[0]?.n} ===`);
  console.log("   " + r.map((c) => c.COLUMN_NAME).join(", "));
}

async function main() {
  console.log("=== Tables with 'choice'/'choix' in the name ===");
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
       AND (LOWER(TABLE_NAME) LIKE '%choice%' OR LOWER(TABLE_NAME) LIKE '%choix%')
     ORDER BY TABLE_NAME`,
  );
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`).catch(() => [{ n: -1 }]);
    console.log(`  ${t.TABLE_NAME}  (rows≈${n[0]?.n})`);
  }

  console.log("\n=== Any table (non-Tmp) with SEC_/PREM_/TLE_/LVA columns ===");
  const cc = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT DISTINCT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE (COLUMN_NAME LIKE 'SEC[_]%' OR COLUMN_NAME LIKE 'PREM[_]%' OR COLUMN_NAME LIKE 'TLE[_]%'
              OR COLUMN_NAME LIKE '%LVA[_]%' OR COLUMN_NAME LIKE '%LVB[_]%')
       AND TABLE_NAME NOT LIKE '%Tmp%'
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  let last = "";
  for (const c of cc) {
    if (c.TABLE_NAME !== last) { console.log(`\n  [${c.TABLE_NAME}]`); last = c.TABLE_NAME; }
    process.stdout.write(`${c.COLUMN_NAME} `);
  }
  console.log("");

  // Finalized-registration & enrollment tables that might carry the choices.
  await cols("Isc_StudentClass");
  await cols("Isc_ModifClasse_Choices");
  await cols("Isc_Classe_Choices");
  await cols("Isc_StudentChoices");
  await cols("Isc_StudentOptions");

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

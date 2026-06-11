/**
 * Read-only: find where Dars stores the "Renseignements pédagogiques" choices —
 * langues (LVA/LVB/LVC), options, spécialités, BFI, SI — beyond ALE/ALM. Looks
 * for dedicated tables/columns and inspects the dynamic-fields mechanism.
 */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

const TBL = [
  "lang", "langue", "specialit", "option", "choix", "pedago", "lva",
  "matiere", "subject", "discipline", "cours", "dynamic", "field", "bfi",
];
const COL = [
  "lva", "lvb", "lvc", "specialit", "bfi", "hggsp", "hlp", "llce", "langue",
  "option", "matiere", "internationa", "expert", "complement",
];

async function main() {
  console.log("=== Tables matching a pedagogical keyword ===");
  const tbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
       AND (${TBL.map((k) => `LOWER(TABLE_NAME) LIKE '%${k}%'`).join(" OR ")})
     ORDER BY TABLE_NAME`,
  );
  for (const t of tbls) {
    const n = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM [${t.TABLE_NAME}]`).catch(() => [{ n: -1 }]);
    console.log(`  ${t.TABLE_NAME}  (rows≈${n[0]?.n})`);
  }

  console.log("\n=== Columns matching a pedagogical keyword (Isc_*) ===");
  const cols = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME LIKE 'Isc[_]%' AND (${COL.map((k) => `LOWER(COLUMN_NAME) LIKE '%${k}%'`).join(" OR ")})
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  let last = "";
  for (const c of cols) {
    if (c.TABLE_NAME !== last) { console.log(`\n  [${c.TABLE_NAME}]`); last = c.TABLE_NAME; }
    console.log(`     ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
  }

  // Dynamic-fields mechanism: definitions + sample values.
  console.log("\n=== Dynamic field definition tables ===");
  const dynTbls = await darsQuery<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
       AND LOWER(TABLE_NAME) LIKE '%dynamicfield%' ORDER BY TABLE_NAME`,
  );
  for (const t of dynTbls) console.log(`  ${t.TABLE_NAME}`);

  // Try to read field labels (look for a definitions table).
  for (const tname of ["Isc_DynamicFields", "Isc_DynamicField", "Isc_DynamicFieldDefinition"]) {
    const exists = await darsQuery<{ n: number }>(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='${tname}'`,
    ).catch(() => [{ n: 0 }]);
    if ((exists[0]?.n ?? 0) > 0) {
      console.log(`\n=== ${tname} columns ===`);
      const c = await darsQuery<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${tname}' ORDER BY ORDINAL_POSITION`,
      );
      console.log("   " + c.map((x) => x.COLUMN_NAME).join(", "));
      const sample = await darsQuery<Record<string, unknown>>(`SELECT TOP 20 * FROM [${tname}]`).catch(() => []);
      for (const row of sample.slice(0, 20)) console.log("   ", JSON.stringify(row));
    }
  }

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

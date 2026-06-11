/**
 * Read-only: find "authorized to pick up the child" data in Dars — focused on
 * the registration tables (Isc_*) and the full column list of the student
 * registration tables, beyond the single transport pickup person we import.
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

const KEYS = [
  "person", "pickup", "recup", "fetch", "deleg", "mandat", "authoriz",
  "leave", "alone", "collect", "relation", "fetch", "trans_pers", "transpers",
];

async function cols(table: string) {
  const r = await darsQuery<{ COLUMN_NAME: string; DATA_TYPE: string }>(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION`,
  );
  console.log(`\n=== ${table} — ${r.length} columns ===`);
  console.log(
    r
      .map((c) => c.COLUMN_NAME)
      .join(", "),
  );
}

async function main() {
  const like = KEYS.map((k) => `LOWER(COLUMN_NAME) LIKE '%${k}%'`).join(" OR ");
  const r = await darsQuery<{
    TABLE_NAME: string;
    COLUMN_NAME: string;
    DATA_TYPE: string;
  }>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME LIKE 'Isc[_]%' AND (${like})
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  console.log("=== Isc_* columns matching a pickup/authorization keyword ===");
  let last = "";
  for (const c of r) {
    if (c.TABLE_NAME !== last) {
      console.log(`\n  [${c.TABLE_NAME}]`);
      last = c.TABLE_NAME;
    }
    console.log(`     ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
  }

  // Full column lists of the student registration tables.
  await cols("Isc_TmpStudent");
  await cols("Isc_ModifStudents");
  await cols("Isc_Student");
  await cols("Isc_TmpParent");
  await cols("Isc_ModifRelations");

  // Does the relations table hold real data? Sample + count.
  const relCount = await darsQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM Isc_ModifRelations`,
  ).catch(() => [{ n: -1 }]);
  console.log(`\n=== Isc_ModifRelations rows: ${relCount[0]?.n} ===`);
  const relSample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 5 * FROM Isc_ModifRelations`,
  ).catch(() => []);
  for (const row of relSample) console.log("   ", JSON.stringify(row));

  // Emergency-contact fill on the in-progress parent table.
  const emg = await darsQuery<Record<string, unknown>>(
    `SELECT
       SUM(CASE WHEN Emergency_Relationship1 IS NOT NULL AND LTRIM(RTRIM(Emergency_Relationship1))<>'' THEN 1 ELSE 0 END) AS rel1,
       SUM(CASE WHEN Emergency_Relationship2 IS NOT NULL AND LTRIM(RTRIM(Emergency_Relationship2))<>'' THEN 1 ELSE 0 END) AS rel2,
       COUNT(*) AS total
     FROM Isc_TmpParent`,
  ).catch(() => []);
  console.log(`\n=== Isc_TmpParent emergency contacts: ${JSON.stringify(emg[0] ?? {})} ===`);

  // ID_Gardian fill on the master student table.
  const gard = await darsQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN ID_Gardian IS NOT NULL AND ID_Gardian>0 THEN 1 ELSE 0 END) AS withGardian
     FROM Isc_Student`,
  ).catch(() => []);
  console.log(`=== Isc_Student ID_Gardian: ${JSON.stringify(gard[0] ?? {})} ===`);

  // TransPersonName fill (the pickup person we already import).
  const tp = await darsQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN TransPersonName IS NOT NULL AND LTRIM(RTRIM(TransPersonName))<>'' THEN 1 ELSE 0 END) AS withPerson
     FROM Isc_TmpStudent`,
  ).catch(() => []);
  console.log(`=== Isc_TmpStudent TransPersonName: ${JSON.stringify(tp[0] ?? {})} ===`);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

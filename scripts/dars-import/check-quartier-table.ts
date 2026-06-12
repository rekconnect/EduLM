/** Read-only: structure of Trs_Codes (quartiers?) and Trs_Zone. */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  const cols = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME IN ('Trs_Codes','Trs_Zone') ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );
  for (const t of ["Trs_Codes", "Trs_Zone"]) {
    console.log(`${t}: ${cols.filter((c) => c.TABLE_NAME === t).map((c) => c.COLUMN_NAME).join(", ")}`);
  }
  console.log("\nTrs_Zone rows:");
  for (const r of await darsQuery("SELECT TOP 12 * FROM Trs_Zone")) console.log("  ", JSON.stringify(r).slice(0, 200));
  console.log("\nTrs_Codes sample:");
  for (const r of await darsQuery("SELECT TOP 8 * FROM Trs_Codes")) console.log("  ", JSON.stringify(r).slice(0, 200));
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

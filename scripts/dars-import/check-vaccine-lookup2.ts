/** Read-only: hunt the vaccine-name lookup for Med_Immunizations ids. */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  // Med_Lists across ALL colleges — maybe vaccines live under another Id_College.
  const lists = await darsQuery<Record<string, unknown>>(
    `SELECT ID, Id_College, ValueName, Type FROM Med_Lists ORDER BY ID`,
  );
  console.log(`Med_Lists ALL colleges (${lists.length} rows):`);
  for (const l of lists) console.log(`  ${l.ID} [college ${l.Id_College}, type ${l.Type}]: ${l.ValueName}`);

  // Med_HistoryFormLabels.
  const labels = await darsQuery<Record<string, unknown>>(
    `SELECT * FROM Med_HistoryFormLabels`,
  );
  console.log("\nMed_HistoryFormLabels:");
  for (const l of labels) console.log("  ", JSON.stringify(l));

  // Isc_Codes code types (vaccines may be a code type).
  const types = await darsQuery<Record<string, unknown>>(
    `SELECT CodeType, COUNT(*) AS n FROM Isc_Codes GROUP BY CodeType ORDER BY CodeType`,
  );
  console.log("\nIsc_Codes types:");
  for (const t of types) console.log(`  ${t.CodeType}: ${t.n}`);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

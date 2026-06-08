/**
 * Read-only: find every Dars column that could hold a photo authorization
 * (Publish / Image / Souvenir / Radio / Social / Auth) across ALL tables —
 * to locate where active students' authorizations actually live.
 */
import { darsQuery, closeDars } from "./lib/dars-pool.js";

async function main() {
  console.log("Auth-related columns across all Dars tables:\n");
  const cols = await darsQuery<{ TABLE_NAME: string; COLUMN_NAME: string }>(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE COLUMN_NAME LIKE '%Publish%'
        OR COLUMN_NAME LIKE '%Souvenir%'
        OR COLUMN_NAME LIKE '%Radio%'
        OR COLUMN_NAME LIKE '%SocialMedia%'
        OR COLUMN_NAME LIKE '%Autoris%'
        OR COLUMN_NAME LIKE '%Consent%'
     ORDER BY TABLE_NAME, COLUMN_NAME`,
  );
  const byTable = new Map<string, string[]>();
  for (const c of cols) {
    const a = byTable.get(c.TABLE_NAME) ?? [];
    a.push(c.COLUMN_NAME);
    byTable.set(c.TABLE_NAME, a);
  }
  for (const [t, c] of byTable) console.log(`  ${t}: ${c.join(", ")}`);

  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

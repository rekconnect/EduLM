/** Read-only: list Dars cazas + town counts, to gauge the village lookup gap. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const qazas = await darsQuery<{ ID: number; Qaza: string; QazaAR: string }>(
    `SELECT ID, Qaza, QazaAR FROM Isc_Qaza WHERE Id_College=${C} ORDER BY Qaza`,
  );
  const counts = await darsQuery<{ Id_Qaza: number; n: number }>(
    `SELECT Id_Qaza, COUNT(*) AS n FROM Isc_Town WHERE Id_College=${C} GROUP BY Id_Qaza`,
  );
  const byQaza = new Map(counts.map((c) => [Number(c.Id_Qaza), Number(c.n)]));
  const totalTowns = await darsQuery<{ n: number }>(
    `SELECT COUNT(*) AS n FROM Isc_Town WHERE Id_College=${C}`,
  );
  console.log(`Cazas: ${qazas.length} · Total towns: ${totalTowns[0]?.n}`);
  for (const q of qazas) {
    console.log(`  [${q.ID}] ${q.Qaza ?? "?"} / ${q.QazaAR ?? "?"} — ${byQaza.get(Number(q.ID)) ?? 0} towns`);
  }
  // Sample of town names (FR + AR) to see naming.
  const sample = await darsQuery<{ TownName: string; TownNameAr: string; Id_Qaza: number }>(
    `SELECT TOP 15 TownName, TownNameAr, Id_Qaza FROM Isc_Town WHERE Id_College=${C} ORDER BY Id_Town`,
  );
  console.log("\nSample towns:");
  for (const t of sample) console.log(`  "${t.TownName ?? ""}" / "${t.TownNameAr ?? ""}" (qaza ${t.Id_Qaza})`);
}

main().catch((e) => console.error("ERR", e.message)).finally(() => closeDars());

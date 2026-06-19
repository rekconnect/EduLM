/**
 * Regenerate LEBANON_TOWNS_BY_KAZA in src/lib/lookups.ts from the Dars
 * Isc_Town table (the authoritative town list for Montaigne's families,
 * ~1746 towns across 30 cazas). Keyed by the French caza names already in
 * LEBANON_REGIONS_FR. Dry-run prints per-caza counts; --confirm writes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

const LOOKUPS = "src/lib/lookups.ts";

// Dars Qaza FR name → the caza name used in LEBANON_REGIONS_FR.
const QAZA_ALIAS: Record<string, string> = {
  Akkar: "Aakkar",
  Aley: "Aley",
  Baabda: "Baabda",
  Baalbeck: "Baalbek",
  Batroun: "Batroun",
  Bcharre: "Becharré",
  "Bekaa Ouest": "Békaa-Ouest",
  "Bent Jbeil": "Bint Jbeil",
  Beyrouth: "Beyrouth",
  "El Chouf": "Chouf",
  "El Hermel": "Hermel",
  "El Koura": "Koura",
  "El Minieh-Dennie": "Minieh-Danniyé",
  Hasbaya: "Hasbaya",
  Jbeil: "Jbeil (Byblos)",
  Jezzine: "Jezzine",
  Keserwan: "Kesrouan",
  Marjeyoun: "Marjeyoun",
  Maten: "Matn",
  Nabatieh: "Nabatieh",
  Rachaya: "Rachaya",
  Saida: "Saïda",
  Tripoli: "Tripoli",
  Tyr: "Sour (Tyr)",
  Zahle: "Zahlé",
  Zgharta: "Zgharta",
};

async function main() {
  const CONFIRM = process.argv.includes("--confirm");
  const qazas = await darsQuery<{ ID: number; Qaza: string }>(
    `SELECT ID, Qaza FROM Isc_Qaza WHERE Id_College=${C}`,
  );
  const qazaName = new Map<number, string>();
  for (const q of qazas) qazaName.set(Number(q.ID), (q.Qaza ?? "").trim());

  const towns = await darsQuery<{ TownName: string; TownNameAr: string; Id_Qaza: number }>(
    `SELECT TownName, TownNameAr, Id_Qaza FROM Isc_Town WHERE Id_College=${C} ORDER BY TownName`,
  );

  const byCaza = new Map<string, Set<string>>();
  let skipped = 0;
  for (const t of towns) {
    const darsQaza = qazaName.get(Number(t.Id_Qaza)) ?? "";
    const caza = QAZA_ALIAS[darsQaza];
    const name = (t.TownName ?? "").trim() || (t.TownNameAr ?? "").trim();
    if (!caza || !name || name === "--" || name.startsWith("--")) { skipped++; continue; }
    if (!byCaza.has(caza)) byCaza.set(caza, new Set());
    byCaza.get(caza)!.add(name);
  }

  // Emit in the LEBANON_REGIONS_FR order, falling back to alphabetical.
  const orderedCazas = [...byCaza.keys()].sort((a, b) => a.localeCompare(b, "fr"));
  let body = "export const LEBANON_TOWNS_BY_KAZA: Record<string, string[]> = {\n";
  let total = 0;
  for (const caza of orderedCazas) {
    const list = [...byCaza.get(caza)!].sort((a, b) => a.localeCompare(b, "fr"));
    total += list.length;
    console.log(`  ${caza}: ${list.length}`);
    body += `  ${JSON.stringify(caza)}: [\n`;
    for (const town of list) body += `    ${JSON.stringify(town)},\n`;
    body += `  ],\n`;
  }
  body += "};\n";
  console.log(`\nTotal towns emitted: ${total} (skipped ${skipped}) across ${orderedCazas.length} cazas.`);

  // Splice into lookups.ts, replacing the existing object literal.
  const src = readFileSync(LOOKUPS, "utf8");
  const startMarker = "export const LEBANON_TOWNS_BY_KAZA";
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error("LEBANON_TOWNS_BY_KAZA not found in lookups.ts");
  // End = first line that is exactly "};" at column 0 after start.
  const endRel = src.slice(start).search(/\n};\n/);
  if (endRel < 0) throw new Error("closing }; not found");
  const end = start + endRel + "\n};\n".length;
  const next = src.slice(0, start) + body + src.slice(end);

  if (CONFIRM) {
    writeFileSync(LOOKUPS, next, "utf8");
    console.log("\nlookups.ts WRITTEN.");
  } else {
    console.log("\nDry-run. Re-run with --confirm to write lookups.ts.");
  }
}

main().catch((e) => console.error("ERR", e.message)).finally(() => closeDars());

/**
 * Fill the missing zone numbers (zoneno_matin / zoneno_soir) in
 * bus_periods["2025-2026|T3"]:
 *   1. per student+direction from their Dars station rows
 *      (Trs_Eleve_Station.Id_Quartier → Isc_Town.Id_ZoneBus → Trs_Zone.ligne);
 *   2. fallback by quartier NAME against the Isc_Town table.
 * Towns with Id_ZoneBus=0 have no zone in Dars — left empty on purpose.
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’\-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // 1. Per-student zone by direction from station rows.
  const st = await darsQuery<{ Id_Eleve: number; Type_Trajet: string; ZoneNo: string | null }>(
    `SELECT es.Id_Eleve, es.Type_Trajet, z.ligne AS ZoneNo
     FROM Trs_Eleve_Station es
     JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit AND c.Annee=2026
     LEFT JOIN Isc_Town t ON t.Id_Town = es.Id_Quartier
     LEFT JOIN Trs_Zone z ON z.ID = t.Id_ZoneBus
     WHERE es.Id_College=${C} AND es.Flag_Desistement=0`,
  );
  const byEleve = new Map<number, { matin?: string; soir?: string }>();
  for (const r of st) {
    const z = (r.ZoneNo ?? "").trim();
    if (!z || z === "0") continue;
    const e = byEleve.get(r.Id_Eleve) ?? {};
    if (r.Type_Trajet === "AS" || r.Type_Trajet === "AR") e.matin = e.matin ?? z;
    if (r.Type_Trajet === "RS" || r.Type_Trajet === "AR") e.soir = e.soir ?? z;
    byEleve.set(r.Id_Eleve, e);
  }

  // 2. Quartier-name → zone map (all towns that have a bus zone).
  const towns = await darsQuery<{ TownName: string; ZoneNo: string | null }>(
    `SELECT t.TownName, z.ligne AS ZoneNo
     FROM Isc_Town t JOIN Trs_Zone z ON z.ID = t.Id_ZoneBus
     WHERE ISNULL(t.Id_ZoneBus, 0) <> 0`,
  );
  const strip = (s: string) =>
    norm(s)
      .split(" ")
      .filter((w) => !["el", "al", "ech", "et", "deir"].includes(w))
      .join(" ");
  const zoneByTown = new Map<string, string>();
  const zoneByTownStripped = new Map<string, string>();
  const townKeys: Array<{ key: string; zone: string }> = [];
  for (const t of towns) {
    const z = (t.ZoneNo ?? "").trim();
    if (!z || z === "0") continue;
    zoneByTown.set(norm(t.TownName), z);
    zoneByTownStripped.set(strip(t.TownName), z);
    townKeys.push({ key: norm(t.TownName), zone: z });
  }
  townKeys.sort((a, b) => b.key.length - a.key.length); // longest first for containment
  const lev = (a: string, b: string): number => {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0]![j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        d[i]![j] = Math.min(
          d[i - 1]![j]! + 1,
          d[i]![j - 1]! + 1,
          d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
    return d[m]![n]!;
  };
  /** quartier text → zone: exact → particles stripped → starts-with town → distance ≤1. */
  const zoneForQuartier = (quartier: string): string | undefined => {
    const nq = norm(quartier);
    if (!nq || nq === "--") return undefined;
    const exact = zoneByTown.get(nq) ?? zoneByTownStripped.get(strip(quartier));
    if (exact) return exact;
    // Free-text addresses that BEGIN with a known town ("antelias mezher rue 610…").
    for (const t of townKeys) {
      if (t.key.length >= 5 && (nq.startsWith(t.key + " ") || nq === t.key)) return t.zone;
    }
    // Quartier that is the TAIL of a compound town name ("Mar Roukoz" ⊂ "Dekwaneh-Mar Roukoz").
    if (nq.length >= 8) {
      for (const t of townKeys) {
        if (t.key.endsWith(" " + nq)) return t.zone;
      }
    }
    // Spelling drift (Dik Mehdi/Dik El-Mehdi handled above; Bsefrine/Bsifrine here).
    const sq = strip(quartier);
    if (sq.length >= 6) {
      let best: { zone: string; d: number } | undefined;
      let ties = 0;
      for (const [key, zone] of zoneByTownStripped) {
        const d = lev(sq, key);
        if (d <= 1) {
          if (!best || d < best.d) {
            best = { zone, d };
            ties = 1;
          } else if (d === best.d && zone !== best.zone) ties++;
        }
      }
      if (best && ties === 1) return best.zone;
    }
    return undefined;
  };
  console.log(`Couverture: ${byEleve.size} élèves avec zone côté Dars · ${zoneByTown.size} quartiers→zone`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });

  let fromStations = 0;
  let fromTownName = 0;
  const stillEmpty: string[] = [];
  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];

  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;
    const dars = byEleve.get(Number(s.darsStudentId)) ?? {};
    const notes: string[] = [];

    for (const dir of ["matin", "soir"] as const) {
      const on = dir === "matin" ? p.as === "yes" : p.rs === "yes";
      if (!on || (p[`zoneno_${dir}`] ?? "").trim()) continue;
      const fromSt = dir === "matin" ? dars.matin : dars.soir;
      const quartier = (p[`zone_${dir}`] ?? "").trim();
      const fromTown = quartier ? zoneForQuartier(quartier) : undefined;
      const z = fromSt ?? fromTown;
      if (z) {
        p[`zoneno_${dir}`] = z;
        notes.push(`${dir}→Z${z}${fromSt ? "" : " (par quartier)"}`);
        if (fromSt) fromStations++;
        else fromTownName++;
      } else {
        stillEmpty.push(`${s.lastName} ${s.firstName} — ${dir} · quartier "${quartier || "—"}"`);
      }
    }
    if (notes.length) {
      periods[PERIOD] = p;
      ca.bus_periods = JSON.stringify(periods);
      updates.push({ id: s.id, ca, label: `${s.lastName} ${s.firstName}: ${notes.join(" · ")}` });
    }
  }

  console.log(`\nZones remplies: ${fromStations} via stations Dars · ${fromTownName} via nom de quartier — ${updates.length} élèves`);
  for (const u of updates.slice(0, 60)) console.log(`  ~ ${u.label}`);
  console.log(`\nToujours sans zone (${stillEmpty.length}) — quartier hors zone (Id_ZoneBus=0) ou introuvable:`);
  for (const e of stillEmpty) console.log(`  ! ${e}`);

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    let done = 0;
    for (const u of updates) {
      await prisma.student.update({
        where: { id: u.id },
        data: { customAnswers: u.ca as Prisma.InputJsonValue },
      });
      done++;
      if (done % 50 === 0) console.log(`  …${done}`);
    }
    console.log(`\n✓ ${done} élèves mis à jour.`);
  }

  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});

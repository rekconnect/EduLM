/**
 * Split address text out of the quartier field (user: "Naccache near el
 * beerje restaurant riach blg underground 2" → quartier "Naccache", the rest
 * is the station). Conservative rules — only split when the remainder looks
 * like an address (rue / imm / near / en face / étage / n° …):
 *   1. quartier exactly = a known Dars town → leave;
 *   2. longest known-town prefix + addressy remainder → split;
 *   3. "<quartier> rue …" / "<quartier> near …" / "<quartier> en face …" → split;
 *   4. trailing building number ("Beit l kikko 201") → split.
 * Station: remainder goes FIRST, existing station kept after " · ".
 * All periods, all directions. Dry-run; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const EVIDENCE = /(rue|imm\.?|near|en face|face de|restaurant|etage|étage|underground|blg|bldg|building|\d)/i;

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const towns = await darsQuery<{ TownName: string }>(
    `SELECT DISTINCT TownName FROM Isc_Town WHERE TownName IS NOT NULL AND LEN(TownName) >= 4`,
  );
  const townSet = new Set(towns.map((t) => norm(t.TownName)));
  const townList = [...townSet].sort((a, b) => b.length - a.length);

  /** → null (leave) or { quartier, stationExtra } */
  function split(q: string): { quartier: string; extra: string } | null {
    const nq = norm(q);
    if (!nq || townSet.has(nq)) return null;
    // 2. known-town prefix
    for (const t of townList) {
      if (nq.startsWith(t + " ") || nq.startsWith(t + ".")) {
        const extra = q.slice(t.length).replace(/^[\s.·,-]+/, "").trim();
        if (extra && EVIDENCE.test(extra)) return { quartier: q.slice(0, t.length).trim(), extra };
      }
    }
    // 3. keyword split
    const kw = /^(.+?)\s+((?:rue|near|en face)\b.*)$/i.exec(q);
    if (kw && kw[1]!.trim().split(" ").length <= 3 && EVIDENCE.test(kw[2]!)) {
      return { quartier: kw[1]!.trim(), extra: kw[2]!.trim() };
    }
    // 4. trailing building number
    const num = /^(.+?)\s+(\d{1,4})$/.exec(q);
    if (num && num[1]!.trim().split(" ").length <= 4) {
      return { quartier: num[1]!.trim(), extra: num[2]! };
    }
    return null;
  }

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string[] }> = [];
  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const notes: string[] = [];
    for (const [key, p] of Object.entries(periods)) {
      for (const dir of ["matin", "soir"] as const) {
        const q = (p[`zone_${dir}`] ?? "").trim();
        if (!q) continue;
        const r = split(q);
        if (!r) continue;
        const oldStation = (p[`station_${dir}`] ?? "").trim();
        const newStation = [r.extra, oldStation && oldStation !== r.extra ? oldStation : ""]
          .filter(Boolean)
          .join(" · ");
        p[`zone_${dir}`] = r.quartier;
        p[`station_${dir}`] = newStation;
        notes.push(`${key} ${dir}: quartier "${q}" → "${r.quartier}" · station "${newStation}"`);
      }
    }
    if (notes.length) {
      ca.bus_periods = JSON.stringify(periods);
      updates.push({ id: s.id, ca, label: notes.map((n) => `${s.lastName} ${s.firstName} — ${n}`) });
    }
  }

  console.log(`\n${updates.length} élèves à corriger:`);
  for (const u of updates) for (const l of u.label) console.log(`  ~ ${l}`);

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    for (const u of updates) {
      await prisma.student.update({
        where: { id: u.id },
        data: { customAnswers: u.ca as Prisma.InputJsonValue },
      });
    }
    console.log(`\n✓ ${updates.length} élèves mis à jour.`);
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

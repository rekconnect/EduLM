/**
 * Move the activity info from remarques into the structured fields
 * (act_bus / act_nom / act_jours) and EMPTY the remarque (it stays free for
 * real notes). Parses the "Bus N — Activité (Jours) · Activité2 (Jours2)"
 * format written by sync-activites-file.
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p) continue;
    const m = /^Bus\s*(\d+)\s*—\s*(.+)$/.exec((p.remarques ?? "").trim());
    if (!m) continue;
    const bus = m[1]!;
    // "Chorale (Lundi) · Escrime (Mercredi, Vendredi)" → names + days, paired with " / ".
    const parts = m[2]!.split(" · ").map((x) => x.trim()).filter(Boolean);
    const noms: string[] = [];
    const jours: string[] = [];
    for (const part of parts) {
      const pm = /^(.+?)\s*\(([^)]+)\)$/.exec(part);
      if (pm) {
        noms.push(pm[1]!.trim());
        jours.push(pm[2]!.trim());
      } else {
        noms.push(part);
        jours.push("");
      }
    }
    p.act_bus = bus;
    p.act_nom = noms.join(" / ");
    p.act_jours = jours.filter(Boolean).join(" / ");
    p.activite_soir = p.rs === "yes" ? "yes" : p.activite_soir ?? "";
    p.remarques = "";
    periods[PERIOD] = p;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({
      id: s.id,
      ca,
      label: `${s.lastName} ${s.firstName} — bus ${bus} · "${p.act_nom}" · "${p.act_jours}" (remarque vidée)`,
    });
  }

  console.log(`\n${updates.length} élèves à migrer:`);
  for (const u of updates) console.log(`  ~ ${u.label}`);

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    for (const u of updates) {
      await prisma.student.update({
        where: { id: u.id },
        data: { customAnswers: u.ca as Prisma.InputJsonValue },
      });
    }
    console.log(`\n✓ ${updates.length} élèves migrés.`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

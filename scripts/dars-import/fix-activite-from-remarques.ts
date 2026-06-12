/**
 * Correct rule for the "activité" flags (per Raed): the activity-return
 * students are the ones listed in the "Activités" tables of the BUS MAJ
 * workbook tabs — already captured in remarques as "Activités: <jours>".
 *
 *   activite_soir = "yes"  ⟺  rs="yes" AND remarques contains "Activités:"
 *   activite_matin = ""     (activities only produce evening returns)
 *
 * Replaces the previous Dars-coverage heuristic. Dry-run; --confirm to write.
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
  let flagged = 0;
  let unflagged = 0;

  for (const s of students) {
    const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>) };
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch { continue; }
    const p = periods[PERIOD];
    if (!p || (p.as !== "yes" && p.rs !== "yes")) continue;

    const hasDays = /Activités\s*:/i.test(p.remarques ?? "");
    const wantSoir = p.rs === "yes" && hasDays ? "yes" : "";
    const wantMatin = "";
    if ((p.activite_soir ?? "") === wantSoir && (p.activite_matin ?? "") === wantMatin) continue;

    const notes: string[] = [];
    if ((p.activite_soir ?? "") !== wantSoir) {
      notes.push(wantSoir ? `RS → activité (${(p.remarques ?? "").replace(/^.*Activités\s*:\s*/i, "")})` : "RS → ordinaire");
      if (wantSoir) flagged++;
      else if ((p.activite_soir ?? "") === "yes") unflagged++;
    }
    if ((p.activite_matin ?? "") !== wantMatin) {
      notes.push("AS → ordinaire");
      unflagged++;
    }
    p.activite_soir = wantSoir;
    p.activite_matin = wantMatin;
    periods[PERIOD] = p;
    ca.bus_periods = JSON.stringify(periods);
    updates.push({ id: s.id, ca, label: `${s.lastName} ${s.firstName} — ${notes.join(" · ")}` });
  }

  console.log(`\n${updates.length} élèves à modifier · ${flagged} RS marqués activité · ${unflagged} flags heuristiques retirés`);
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
    console.log(`\n✓ ${updates.length} élèves mis à jour.`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

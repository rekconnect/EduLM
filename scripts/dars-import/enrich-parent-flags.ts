/**
 * Populate the 3 new parent flags (decede / second_mariage / actuel) into
 * each imported parent's customAnswers, from Dars IsDead / SecondMarriage /
 * Actual. Targeted + merge-only — leaves every other answer untouched.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const parents = await prisma.user.findMany({
    where: { tenantId: T, role: "PARENT", darsParentId: { not: null } },
    select: { id: true, darsParentId: true, customAnswers: true },
  });
  const ids = parents.map((p) => Number(p.darsParentId));

  const flags = await darsQuery<{ ID_Parent: number; IsDead: boolean; SecondMarriage: boolean; Actual: boolean }>(
    `SELECT ID_Parent, IsDead, SecondMarriage, Actual FROM Isc_Parent
     WHERE Id_College=${C} AND ID_Parent IN (${ids.join(",") || "-1"})`,
  );
  const byId = new Map(flags.map((f) => [Number(f.ID_Parent), f]));

  let dead = 0, second = 0, notActual = 0;
  for (const f of flags) {
    if (f.IsDead) dead++;
    if (f.SecondMarriage) second++;
    if (!f.Actual) notActual++;
  }
  console.log(`Parents: ${parents.length} · deceased ${dead} · second marriage ${second} · not actual ${notActual}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  const size = 10;
  for (let i = 0; i < parents.length; i += size) {
    await Promise.all(
      parents.slice(i, i + size).map((p) => {
        const f = byId.get(Number(p.darsParentId));
        if (!f) return Promise.resolve();
        const existing = (p.customAnswers && typeof p.customAnswers === "object" ? p.customAnswers : {}) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...existing, actuel: f.Actual ? "yes" : "no" };
        if (f.IsDead) next.decede = "yes";
        if (f.SecondMarriage) next.second_mariage = "yes";
        return prisma.user.update({ where: { id: p.id }, data: { customAnswers: next } });
      }),
    );
    done += Math.min(size, parents.length - i);
    process.stdout.write(`\r  flagged: ${done}/${parents.length}`);
  }
  process.stdout.write("\n✓ Parent flags populated.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });

/**
 * Read-only audit: every customAnswers key actually present (with fill counts)
 * for students and guardians, flagged by whether a configured field exists for
 * it (→ shown in an EditableGroup) or it's handled by a known hardcoded view.
 * Surfaces data that was imported but has no section yet.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// Keys rendered by hardcoded components (not necessarily in the field-config).
const STUDENT_HARDCODED = new Set([
  "services_by_year",
  "registration_by_year",
  // shown inside StudentYearView per year:
  "auth_site", "auth_livre", "auth_reseaux", "auth_radio",
  "autocar", "transport_aller", "transport_retour", "transport_adresse_diff",
  "transport_rue", "transport_immeuble", "transport_etage",
  "transport_village", "transport_caza", "transport_person",
  "collations", "repas_chaud",
]);

function fieldKeys(cfg: unknown): Set<string> {
  const out = new Set<string>();
  if (cfg && typeof cfg === "object" && Array.isArray((cfg as { fields?: unknown }).fields)) {
    for (const f of (cfg as { fields: Array<{ key?: string; id?: string }> }).fields) {
      if (f.key) out.add(f.key);
      if (f.id) out.add(f.id);
    }
  }
  return out;
}

function tally(rows: Array<{ customAnswers: unknown }>) {
  const count = new Map<string, number>();
  for (const r of rows) {
    const ca = r.customAnswers;
    if (!ca || typeof ca !== "object") continue;
    for (const [k, v] of Object.entries(ca as Record<string, unknown>)) {
      if (v == null || v === "") continue;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return count;
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const tcfg = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { studentFieldsConfig: true, parentFieldsConfig: true },
  });
  const studentFields = fieldKeys(tcfg?.studentFieldsConfig);
  const parentFields = fieldKeys(tcfg?.parentFieldsConfig);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { customAnswers: true },
  });
  const guardians = await prisma.guardian.findMany({
    where: { tenantId: tenant.id },
    select: { user: { select: { customAnswers: true } } },
  });

  const sCount = tally(students);
  const gCount = tally(guardians.map((g) => ({ customAnswers: g.user.customAnswers })));

  function report(
    label: string,
    count: Map<string, number>,
    cfg: Set<string>,
    hardcoded: Set<string>,
  ) {
    console.log(`\n========== ${label} (${count.size} keys with data) ==========`);
    const rows = [...count.entries()].sort((a, b) => b[1] - a[1]);
    const unsurfaced: Array<[string, number]> = [];
    for (const [k, n] of rows) {
      const inCfg = cfg.has(k);
      const inHard = hardcoded.has(k);
      const tag = inCfg ? "field" : inHard ? "view " : "❓NONE";
      if (!inCfg && !inHard) unsurfaced.push([k, n]);
      console.log(`  [${tag}] ${k.padEnd(28)} ${n}`);
    }
    console.log(`\n  → UNSURFACED (data present, no UI): ${unsurfaced.length}`);
    for (const [k, n] of unsurfaced) console.log(`      • ${k}  (${n} records)`);
  }

  report("STUDENTS", sCount, studentFields, STUDENT_HARDCODED);
  report("GUARDIANS / PARENTS", gCount, parentFields, new Set());

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

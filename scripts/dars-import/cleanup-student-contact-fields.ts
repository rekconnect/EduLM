/**
 * Remove the unused student contact entity-fields (portable_eleve = 0 values,
 * email_eleve / email_college = only junk "admin" values) from the tenant's
 * studentFieldsConfig, and scrub those orphan keys from student customAnswers.
 * Dry-run by default; --confirm to write.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const REMOVE = ["portable_eleve", "email_eleve", "email_college"];

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // ── 1. studentFieldsConfig: drop the fields ──
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { studentFieldsConfig: true },
  });
  const cfg =
    t?.studentFieldsConfig && typeof t.studentFieldsConfig === "object"
      ? (t.studentFieldsConfig as Record<string, unknown>)
      : null;
  if (!cfg || !Array.isArray(cfg.fields)) {
    console.log("studentFieldsConfig empty — nothing to do for the config.");
  } else {
    const fields = cfg.fields as Array<{ id?: string; label?: string }>;
    const kept = fields.filter((f) => !REMOVE.includes(String(f.id)));
    const dropped = fields.filter((f) => REMOVE.includes(String(f.id)));
    console.log(`\nChamps config à supprimer (${dropped.length}):`);
    for (const f of dropped) console.log(`  - ${f.id} "${f.label ?? ""}"`);
    console.log(`Champs restants: ${kept.length} (était ${fields.length})`);
    if (confirm && dropped.length) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          studentFieldsConfig: { ...cfg, fields: kept } as unknown as Prisma.InputJsonValue,
        },
      });
      console.log("  ✓ studentFieldsConfig mis à jour.");
    }
  }

  // ── 2. Scrub orphan values from student customAnswers ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, customAnswers: true },
  });
  let scrubbed = 0;
  for (const s of students) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const hit = REMOVE.filter((k) => k in ca);
    if (!hit.length) continue;
    scrubbed++;
    console.log(`  scrub ${s.lastName} ${s.firstName}: ${hit.join(", ")}`);
    if (confirm) {
      const next = { ...ca };
      for (const k of REMOVE) delete next[k];
      await prisma.student.update({
        where: { id: s.id },
        data: { customAnswers: next as Prisma.InputJsonValue },
      });
    }
  }
  console.log(`\nÉlèves avec valeurs orphelines: ${scrubbed}`);
  if (!confirm) console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

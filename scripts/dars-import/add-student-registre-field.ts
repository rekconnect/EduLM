/**
 * Surgical migration: append the student "Registre" field (key registerNum) to
 * the LIVE studentFieldsConfig — preserving every existing field, label
 * override, toggle and ordering (does NOT overwrite the config like the seeder).
 * The imported civil-registry number (registerNum, ~1499 students) then shows
 * and becomes editable in the Info générale section. Idempotent.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/add-student-registre-field.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

type Cat = { id: string; name: string };
type Field = { id?: string; key?: string; order?: number };
type Config = { categories: Cat[]; fields: Field[] };

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { studentFieldsConfig: true },
  });
  const cfg = t?.studentFieldsConfig as unknown as Config | null;
  if (!cfg || !Array.isArray(cfg.fields) || !Array.isArray(cfg.categories)) {
    console.error("No usable studentFieldsConfig found.");
    process.exit(1);
  }

  if (cfg.fields.some((f) => f.key === "registerNum" || f.id === "registerNum")) {
    console.log("Field 'registerNum' already present — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const cat = cfg.categories.find((c) => c.name === "Info générale");
  if (!cat) {
    console.error("No 'Info générale' category in the config.");
    process.exit(1);
  }
  const maxOrder = Math.max(0, ...cfg.fields.map((f) => f.order ?? 0));
  const newField = {
    id: "registerNum",
    key: "registerNum",
    label: "Registre",
    type: "short_text",
    required: false,
    active: true,
    categoryId: cat.id,
    order: maxOrder + 1,
  };
  const next = { ...cfg, fields: [...cfg.fields, newField] };

  console.log(
    `Append 'Registre' (registerNum) → category "${cat.name}" (${cat.id}).`,
  );
  console.log(`Fields: ${cfg.fields.length} → ${next.fields.length} (everything else untouched).`);

  if (!CONFIRM) {
    console.log("\nDry-run. Re-run with --confirm to write.");
    await prisma.$disconnect();
    return;
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { studentFieldsConfig: next as unknown as Prisma.InputJsonValue },
  });
  console.log("✓ Added.");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

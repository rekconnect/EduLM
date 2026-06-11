/**
 * Surgical migration: add the "Renseignements pédagogiques" category + its
 * fields to the LIVE studentFieldsConfig (preserving every existing field /
 * override / order — does NOT overwrite like the seeder). These are the shared
 * key contract the inscription form will fill so the fiche section auto-populates.
 * Idempotent.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/add-pedago-fields.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const CAT = "Renseignements pédagogiques";
const CAT_ID = "cat_renseignements_pedagogiques";

const FIELDS: Array<{ key: string; label: string; type: string; options?: string[] }> = [
  { key: "arabe_langue", label: "Arabe (CE2→3ème)", type: "select", options: ["Langue maternelle", "Langue étrangère"] },
  { key: "lva", label: "LVA", type: "select", options: ["Arabe", "Anglais"] },
  { key: "lvb", label: "LVB", type: "select", options: ["Arabe", "Anglais", "Espagnol"] },
  { key: "lvc", label: "LVC (option)", type: "select", options: ["Arabe", "Espagnol"] },
  { key: "specialites", label: "Spécialités (1ère/Tle)", type: "short_text" },
  { key: "opt_arts_plastiques", label: "Arts plastiques", type: "yes_no" },
  { key: "opt_section_internationale", label: "Section internationale (SI)", type: "yes_no" },
  { key: "opt_bfi", label: "BFI", type: "yes_no" },
  { key: "comp_libanais_physique", label: "Complément libanais – Physique", type: "yes_no" },
  { key: "maths_complementaire", label: "Maths complémentaire", type: "yes_no" },
  { key: "maths_expertes", label: "Maths expertes", type: "yes_no" },
  { key: "comp_libanais_physique_svt", label: "Complément libanais – Physique + SVT", type: "yes_no" },
];

type Cat = { id: string; name: string; order?: number; active?: boolean };
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

  const categories = [...cfg.categories];
  let addedCat = false;
  if (!categories.some((c) => c.name === CAT || c.id === CAT_ID)) {
    const maxOrder = Math.max(0, ...categories.map((c) => c.order ?? 0));
    categories.push({ id: CAT_ID, name: CAT, order: maxOrder + 1, active: true });
    addedCat = true;
  }
  const catId = categories.find((c) => c.name === CAT)?.id ?? CAT_ID;

  const existingKeys = new Set(cfg.fields.map((f) => f.key ?? f.id));
  let order = Math.max(0, ...cfg.fields.map((f) => f.order ?? 0));
  const newFields: Array<Record<string, unknown>> = [...cfg.fields];
  const added: string[] = [];
  for (const f of FIELDS) {
    if (existingKeys.has(f.key)) continue;
    order++;
    newFields.push({
      id: f.key,
      key: f.key,
      label: f.label,
      type: f.type,
      required: false,
      active: true,
      categoryId: catId,
      order,
      ...(f.options ? { options: f.options } : {}),
    });
    added.push(f.key);
  }

  console.log(`Category "${CAT}": ${addedCat ? "added" : "already present"}`);
  console.log(`Fields added: ${added.length} → [${added.join(", ")}]`);
  console.log(`Config: ${cfg.categories.length}→${categories.length} cats, ${cfg.fields.length}→${newFields.length} fields`);

  if (!addedCat && added.length === 0) {
    console.log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }
  if (!CONFIRM) {
    console.log("\nDry-run. Re-run with --confirm to write.");
    await prisma.$disconnect();
    return;
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      studentFieldsConfig: { ...cfg, categories, fields: newFields } as unknown as Prisma.InputJsonValue,
    },
  });
  console.log("✓ Added.");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

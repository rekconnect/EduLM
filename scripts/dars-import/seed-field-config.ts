/**
 * Install the Dars-aligned field set into Tenant.parent/studentFieldsConfig.
 * Replaces the ad-hoc fields with the proper set (user consented). Pulls
 * dropdown options for select fields from Dars Isc_Codes so they're real
 * editable dropdowns. id === key for stable importer writes.
 *
 * DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/seed-field-config.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/seed-field-config.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import {
  PARENT_CATEGORIES,
  PARENT_FIELDS,
  STUDENT_CATEGORIES,
  STUDENT_FIELDS,
  type SeedField,
} from "./field-set.js";

const prisma = new PrismaClient();

const catId = (name: string) =>
  "cat_" +
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

async function optionsForCodeType(codeType: string): Promise<string[]> {
  const rows = await darsQuery<{ CodeValue: string | null }>(
    `SELECT DISTINCT CodeValue FROM Isc_Codes
     WHERE Id_College = ${C} AND CodeType = '${codeType}'
       AND CodeValue IS NOT NULL AND CodeValue <> '--' AND LTRIM(RTRIM(CodeValue)) <> ''
     ORDER BY CodeValue`,
  );
  return rows.map((r) => (r.CodeValue ?? "").trim()).filter(Boolean);
}

async function buildConfig(categories: string[], fields: SeedField[]) {
  const cats = categories.map((name, i) => ({
    id: catId(name),
    name,
    order: i,
    active: true,
  }));
  // Pre-fetch options for each distinct codeType used.
  const codeTypes = [...new Set(fields.map((f) => f.codeType).filter(Boolean))] as string[];
  const optsByType = new Map<string, string[]>();
  for (const ct of codeTypes) optsByType.set(ct, await optionsForCodeType(ct));

  const fieldDefs = fields.map((f, i) => ({
    id: f.key, // stable id === key
    key: f.key,
    label: f.label,
    type: f.type,
    required: false,
    active: true,
    categoryId: catId(f.category),
    order: i,
    ...(f.codeType ? { options: optsByType.get(f.codeType) ?? [] } : {}),
    ...(f.optionsSourceKey ? { optionsSource: { fieldId: f.optionsSourceKey } } : {}),
    ...(f.userBoundTo ? { userBoundTo: f.userBoundTo } : {}),
    ...(f.guardianBoundTo ? { guardianBoundTo: f.guardianBoundTo } : {}),
    ...(f.familyBoundTo ? { familyBoundTo: f.familyBoundTo } : {}),
    ...(f.dossierBoundTo ? { dossierBoundTo: f.dossierBoundTo } : {}),
  }));
  return { categories: cats, fields: fieldDefs };
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const parentCfg = await buildConfig(PARENT_CATEGORIES, PARENT_FIELDS);
  const studentCfg = await buildConfig(STUDENT_CATEGORIES, STUDENT_FIELDS);

  console.log(`Parent config: ${parentCfg.categories.length} categories, ${parentCfg.fields.length} fields`);
  console.log(`Student config: ${studentCfg.categories.length} categories, ${studentCfg.fields.length} fields`);
  for (const f of parentCfg.fields) {
    const opts = (f as { options?: string[] }).options;
    if (opts) console.log(`  parent select "${f.label}": ${opts.length} options`);
  }
  for (const f of studentCfg.fields) {
    const opts = (f as { options?: string[] }).options;
    if (opts) console.log(`  student select "${f.label}": ${opts.length} options`);
  }

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to write.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      parentFieldsConfig: parentCfg,
      studentFieldsConfig: studentCfg,
    },
  });
  console.log("\n✓ Field config installed.");
  await closeDars();
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });

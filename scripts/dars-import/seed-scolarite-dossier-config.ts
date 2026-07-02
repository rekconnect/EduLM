/**
 * Seed / refresh the config-native "Scolarité (dossier)" field set into a
 * tenant's studentFieldsConfig — the 4 sections + ~45 fields defined in
 * src/lib/scolarite-config.ts (the single source of truth also used by the
 * parent tab load/save adapters). This is the REPRODUCIBLE provisioning for
 * the parent Scolarité tab: run once per tenant so the tab isn't empty.
 *
 * Idempotent AND refreshing: strips any prior copy of these 4 categories /
 * their fields and re-adds them from the current specs, so re-running picks up
 * spec changes (e.g. field renames, the 3-state maths select). Every OTHER
 * category/field is preserved untouched — including the admin "Scolarité"
 * (cat_scol) Dars enrollment record, which is a DIFFERENT category.
 *
 * All fields are seeded required=false on purpose (see ScolariteFieldSpec
 * docstring): submitDossier scans studentAnswers, but these store to
 * dossierAnswers, so a config-level `required` would block submission forever.
 * Real required-ness is enforced server-side in saveScolariteTab.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/seed-scolarite-dossier-config.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
import { parseEntityFieldsConfig, type FieldDef } from "@/lib/entity-fields";
import {
  SCOLARITE_CATEGORIES,
  SCOLARITE_CATEGORY_IDS,
  SCOLARITE_CATEGORY_NAMES,
  categoryForSpec,
  scolariteFieldSpecs,
} from "@/lib/scolarite-config";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { studentFieldsConfig: true },
  });
  const cfg = parseEntityFieldsConfig(t?.studentFieldsConfig);

  const myCatNames = new Set(SCOLARITE_CATEGORY_NAMES);
  const myCatIds = new Set(Object.values(SCOLARITE_CATEGORY_IDS));
  const specIds = new Set(scolariteFieldSpecs().map((s) => s.id));

  // Preserve everything that isn't ours.
  const keptCategories = cfg.categories.filter((c) => !myCatNames.has(c.name));
  const keptFields = cfg.fields.filter(
    (f) => !myCatIds.has(f.categoryId) && !specIds.has(f.id),
  );

  const newCategories = SCOLARITE_CATEGORIES.map((c) => ({
    id: SCOLARITE_CATEGORY_IDS[c.name]!,
    name: c.name,
    order: c.order,
    active: true,
  }));

  const orderByCat: Record<string, number> = {};
  const newFields: FieldDef[] = scolariteFieldSpecs().map((s) => {
    const categoryId = SCOLARITE_CATEGORY_IDS[categoryForSpec(s.id)]!;
    const order = (orderByCat[categoryId] = (orderByCat[categoryId] ?? -1) + 1);
    return {
      id: s.id,
      key: s.id,
      label: s.label,
      hint: s.hint,
      type: s.type,
      required: false,
      options: s.options,
      subFields: s.subFields,
      categoryId,
      order,
      showIf: s.showIf,
      hideIf: s.hideIf,
      active: true,
    };
  });

  const next = {
    categories: [...keptCategories, ...newCategories],
    fields: [...keptFields, ...newFields],
  };

  console.log(`Tenant: ${tenant.name}`);
  console.log(
    `  categories ${cfg.categories.length} → ${next.categories.length}`,
  );
  console.log(`  fields     ${cfg.fields.length} → ${next.fields.length}`);
  console.log(
    `  ${SCOLARITE_CATEGORY_NAMES.length} sections, ${newFields.length} fields (all required=false)`,
  );

  if (!confirm) {
    console.log("\nDry-run. Re-run with --confirm to write.");
    await prisma.$disconnect();
    return;
  }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { studentFieldsConfig: next as unknown as Prisma.InputJsonValue },
  });
  console.log("✓ Written.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

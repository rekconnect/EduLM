/**
 * Reconcile the tenant's PARENT custom fields after the Dars import:
 *   - "Mobile Number"  → guardianBoundTo = phone   (was orphaned)
 *   - "Country"        → familyBoundTo  = addressCountry
 *   - "Residential"    → familyBoundTo  = addressCity
 *   - "Field" (junk)   → DELETE
 * Other fields (Name/Last Name/Email Address userBoundTo, Position, Casa)
 * are left untouched. Matches by field id (stable).
 *
 * DRY RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/rebind-fields.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/rebind-fields.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import { parseEntityFieldsConfig } from "../../src/lib/entity-fields.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// Field-id → action. Ids come from the audit (stable client-generated ids).
const REBIND: Record<string, { guardianBoundTo?: string; familyBoundTo?: string }> = {
  e271o33xoj: { guardianBoundTo: "phone" }, // Mobile Number
  "8xxpcnap6m": { familyBoundTo: "addressCountry" }, // Country
  gvk2nubavq: { familyBoundTo: "addressCity" }, // Residential
};
const DELETE_IDS = new Set<string>(["yttsjnlkvr"]); // "Field" (junk)

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { parentFieldsConfig: true },
  });
  const cfg = parseEntityFieldsConfig(t?.parentFieldsConfig);

  console.log("Planned changes:");
  const nextFields = [];
  for (const f of cfg.fields) {
    if (DELETE_IDS.has(f.id)) {
      console.log(`  🗑️  DELETE "${f.label}" (${f.id})`);
      continue;
    }
    const rb = REBIND[f.id];
    if (rb) {
      console.log(
        `  🔗 BIND  "${f.label}" → ${rb.guardianBoundTo ? "guardian." + rb.guardianBoundTo : "family." + rb.familyBoundTo}`,
      );
      nextFields.push({ ...f, ...rb });
    } else {
      nextFields.push(f);
    }
  }
  const nextCfg = { ...cfg, fields: nextFields };

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { parentFieldsConfig: nextCfg },
  });
  console.log("\n✓ parentFieldsConfig updated.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

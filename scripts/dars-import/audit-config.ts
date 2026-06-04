/**
 * Read-only audit of a tenant's field/config blobs, flagging custom
 * fields that now DUPLICATE canonical columns the Dars import populated.
 *
 *   npx tsx scripts/dars-import/audit-config.ts --tenant-name="Lycée Montaigne"
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// Canonical columns the import fills — any custom field bound to / clearly
// duplicating one of these is a cleanup candidate.
const CANON_USER = ["firstName", "lastName", "name", "email"];
const CANON_DOSSIER_HINT = /e-?mail|mobile|t[ée]l|phone|nationalit|passe?port|libanais|lebanese|adresse|address|relation/i;

type FieldDef = {
  id: string;
  key?: string;
  label?: string;
  type?: string;
  active?: boolean;
  userBoundTo?: string | null;
  dossierBoundTo?: string | null;
  categoryId?: string;
};
type Cfg = { categories?: Array<{ id: string; name: string }>; fields?: FieldDef[] };

function dumpFields(title: string, cfg: Cfg) {
  console.log(`\n══════ ${title} ══════`);
  const fields = cfg.fields ?? [];
  if (!fields.length) {
    console.log("  (no custom fields)");
    return;
  }
  for (const f of fields) {
    const bound = f.userBoundTo
      ? `userBoundTo=${f.userBoundTo}`
      : f.dossierBoundTo
        ? `dossierBoundTo=${f.dossierBoundTo}`
        : "";
    const dupCanon = f.userBoundTo && CANON_USER.includes(f.userBoundTo);
    const dupHint = CANON_DOSSIER_HINT.test(f.label ?? "") || CANON_DOSSIER_HINT.test(f.key ?? "");
    const flag = dupCanon ? "  ⚠ DUPLICATES canonical column" : dupHint ? "  ⚠ likely duplicate (label)" : "";
    const status = f.active === false ? "[inactive]" : "";
    console.log(
      `  • "${f.label ?? f.key}" (${f.type ?? "?"}) ${status} ${bound}${flag}`,
    );
  }
}

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      parentFieldsConfig: true,
      studentFieldsConfig: true,
      parentCreateFieldsConfig: true,
      inscriptionFormConfig: true,
      inscriptionTabsConfig: true,
      familyCodePrefix: true,
      familyCodePadding: true,
      familyCodeNextSequence: true,
      invoiceNumberPrefix: true,
      invoiceNumberPadding: true,
      defaultCurrency: true,
    },
  });
  if (!t) return;

  dumpFields("PARENT custom fields (Settings → Forms → Parents)", t.parentFieldsConfig as Cfg);
  dumpFields("STUDENT custom fields (Settings → Forms → Students)", t.studentFieldsConfig as Cfg);
  dumpFields("ADD-PARENT form (dashboard 'Add a parent')", t.parentCreateFieldsConfig as Cfg);

  console.log("\n══════ INSCRIPTION FORM overrides (hardcoded-field label/required/hidden) ══════");
  const insc = t.inscriptionFormConfig as Record<string, unknown>;
  const keys = Object.keys(insc ?? {});
  console.log(keys.length ? `  ${keys.length} override keys: ${keys.join(", ")}` : "  (none)");

  console.log("\n══════ BILLING / CODE FORMAT ══════");
  console.log(`  Family code prefix:   ${t.familyCodePrefix ?? "(unset)"}`);
  console.log(`  Family code padding:  ${t.familyCodePadding}`);
  console.log(`  Family code next seq: ${t.familyCodeNextSequence}`);
  console.log(`  → Import used codes like "F-00129" (prefix "F-" + Dars parent id).`);
  console.log(`  Invoice prefix:       ${t.invoiceNumberPrefix ?? "(unset)"}  padding ${t.invoiceNumberPadding}`);
  console.log(`  Default currency:     ${t.defaultCurrency}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

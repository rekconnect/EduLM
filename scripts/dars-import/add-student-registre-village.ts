/**
 * Surgical student-config tweaks (Raed 2026-09-25):
 *  1. Relabel dars_student_code "Code" → "Code élève" (was confused with the
 *     famille code: élève C00053 vs famille C0005).
 *  2. Add "lieu_registre" (Village du registre) to Info générale right after
 *     registerNum, with inheritParentKey="lieu_registre" so the père's
 *     village shows live when the student has none (children are on the
 *     father's civil registre).
 *
 * Idempotent. DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/add-student-registre-village.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

type Cat = { id: string; name: string };
type Field = { id?: string; key?: string; label?: string; categoryId?: string; order?: number; active?: boolean };
type Config = { categories: Cat[]; fields: Array<Field & Record<string, unknown>> };
const keyOf = (f: Field) => f.key ?? f.id ?? "";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { studentFieldsConfig: true },
  });
  const cfg = t?.studentFieldsConfig as unknown as Config;
  if (!cfg?.fields) { console.error("No usable studentFieldsConfig."); process.exit(1); }
  const log: string[] = [];

  const infoCat = cfg.categories.find((c) => c.name === "Info générale");
  if (!infoCat) { console.error('"Info générale" missing.'); process.exit(1); }

  const code = cfg.fields.find((f) => keyOf(f) === "dars_student_code");
  if (code) {
    if (code.label !== "Code élève") { log.push(`dars_student_code: '${code.label}' → 'Code élève'`); code.label = "Code élève"; }
    else log.push("dars_student_code: label déjà bon");
  } else {
    // The élève code (Dars StudentCode, e.g. C00053) was imported but never
    // displayed — only the famille code showed, hence Raed's C0005 confusion.
    const minOrder = Math.min(...cfg.fields.filter((f) => f.categoryId === infoCat.id).map((f) => f.order ?? 0));
    cfg.fields.push({
      id: "dars_student_code", key: "dars_student_code", label: "Code élève",
      type: "short_text", required: false, active: true, formHidden: true,
      categoryId: infoCat.id, order: minOrder - 1,
    });
    log.push(`dars_student_code: ajouté 'Code élève' (Info générale, order ${minOrder - 1}, formHidden)`);
  }
  // Internal code — never editable by parents on the inscription forms.
  if (code && (code as Record<string, unknown>).formHidden !== true) {
    (code as Record<string, unknown>).formHidden = true;
    log.push("dars_student_code: formHidden=true");
  }
  if (!cfg.fields.some((f) => keyOf(f) === "lieu_registre")) {
    const anchor = cfg.fields.find((f) => keyOf(f) === "registerNum" && f.categoryId === infoCat.id);
    const order = (anchor?.order ?? 0) + 0.5;
    cfg.fields.push({
      id: "lieu_registre", key: "lieu_registre", label: "Village du registre",
      type: "short_text", required: false, active: true,
      categoryId: infoCat.id, order, inheritParentKey: "lieu_registre",
    });
    log.push(`lieu_registre: ajouté (Info générale, order ${order}, hérite du père)`);
  } else log.push("lieu_registre: déjà présent");

  console.log(log.map((l) => "  " + l).join("\n"));
  if (!CONFIRM) { console.log("\nDry-run. --confirm pour écrire."); await prisma.$disconnect(); return; }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { studentFieldsConfig: cfg as unknown as Prisma.InputJsonValue },
  });
  console.log("✓ Config mis à jour.");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

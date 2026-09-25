/**
 * Surgical live-config reorganization (2026-09-25, Raed's field pass):
 *
 * PARENT config:
 *  1. Move numero_registre / caza_registre / lieu_registre out of the never-
 *     rendered "Adresse de registre" category into "Info générale" (right
 *     after numero_identite when present), bilingual labels — the fiche's
 *     admin view and both parent forms render Info générale, so the Dars
 *     "Registre No. X · Lieu Y" line becomes visible everywhere.
 *  2. Deactivate the emptied "Adresse de registre" category.
 *  3. Info Arabe address block: hide adresse_place_ar (تفاصيل) and slot
 *     adresse_village_ar (البلدة) + adresse_qaza_ar (القضاء) right after
 *     adresse_immeuble_ar (المبنى).
 *
 * STUDENT config:
 *  4. Add "classe" (Classe, short_text) to Scolarité right after "niveau".
 *
 * Idempotent. DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/reorganize-registre-fields.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");

type Cat = { id: string; name: string; order?: number; active?: boolean };
type Field = {
  id?: string; key?: string; label?: string; type?: string;
  categoryId?: string; active?: boolean; order?: number; required?: boolean;
};
type Config = { categories: Cat[]; fields: Field[] };

const keyOf = (f: Field) => f.key ?? f.id ?? "";

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { parentFieldsConfig: true, studentFieldsConfig: true },
  });
  const pCfg = t?.parentFieldsConfig as unknown as Config;
  const sCfg = t?.studentFieldsConfig as unknown as Config;
  if (!pCfg?.fields || !sCfg?.fields) {
    console.error("Configs not usable.");
    process.exit(1);
  }
  const log: string[] = [];

  // ── 1+2. Parent: registre trio → Info générale ──
  const pInfoCat = pCfg.categories.find((c) => c.name === "Info générale");
  const registreCat = pCfg.categories.find((c) => c.name === "Adresse de registre");
  if (!pInfoCat) { console.error('Parent "Info générale" category missing.'); process.exit(1); }
  const anchor = pCfg.fields.find((f) => keyOf(f) === "numero_identite" && f.categoryId === pInfoCat.id);
  const baseOrder = anchor?.order ?? Math.max(0, ...pCfg.fields.filter((f) => f.categoryId === pInfoCat.id).map((f) => f.order ?? 0));
  // make room: bump every Info générale field after the anchor by 3
  for (const f of pCfg.fields) {
    if (f.categoryId === pInfoCat.id && (f.order ?? 0) > baseOrder) f.order = (f.order ?? 0) + 3;
  }
  const TRIO: Array<[string, string, number]> = [
    ["numero_registre", "N° registre (رقم القيد)", 1],
    ["lieu_registre", "Lieu du registre (مكان القيد)", 2],
    ["caza_registre", "Caza du registre (قضاء القيد)", 3],
  ];
  for (const [key, label, off] of TRIO) {
    const f = pCfg.fields.find((x) => keyOf(x) === key);
    if (!f) { log.push(`! ${key}: absent — skip`); continue; }
    const was = pCfg.categories.find((c) => c.id === f.categoryId)?.name ?? "?";
    f.categoryId = pInfoCat.id;
    f.label = label;
    f.order = baseOrder + off;
    f.active = true;
    log.push(`parent ${key}: ${was} → Info générale · '${label}' · order ${f.order}`);
  }
  if (registreCat) {
    const left = pCfg.fields.filter((f) => f.categoryId === registreCat.id && f.active !== false);
    if (left.length === 0) { registreCat.active = false; log.push(`catégorie "Adresse de registre" désactivée (vide)`); }
    else log.push(`! "Adresse de registre" garde ${left.length} champ(s) actifs: ${left.map(keyOf).join(", ")}`);
  }

  // ── 3. Info Arabe address block ──
  const place = pCfg.fields.find((f) => keyOf(f) === "adresse_place_ar");
  if (place && place.active !== false) { place.active = false; log.push(`adresse_place_ar (تفاصيل): désactivé`); }
  const immeuble = pCfg.fields.find((f) => keyOf(f) === "adresse_immeuble_ar");
  const village = pCfg.fields.find((f) => keyOf(f) === "adresse_village_ar");
  const qaza = pCfg.fields.find((f) => keyOf(f) === "adresse_qaza_ar");
  if (immeuble && village && qaza) {
    village.order = (immeuble.order ?? 0) + 0.1;
    qaza.order = (immeuble.order ?? 0) + 0.2;
    log.push(`ordre Info Arabe: المبنى(${immeuble.order}) → البلدة(${village.order}) → القضاء(${qaza.order})`);
  }

  // ── 4. Student: classe in Scolarité ──
  const scoCat = sCfg.categories.find((c) => c.name === "Scolarité");
  if (!scoCat) { console.error('Student "Scolarité" category missing.'); process.exit(1); }
  if (!sCfg.fields.some((f) => keyOf(f) === "classe")) {
    const niveau = sCfg.fields.find((f) => keyOf(f) === "niveau" && f.categoryId === scoCat.id);
    const nOrder = niveau?.order ?? 1;
    sCfg.fields.push({
      id: "classe", key: "classe", label: "Classe", type: "short_text",
      required: false, active: true, categoryId: scoCat.id, order: nOrder + 0.5,
    });
    log.push(`student classe: ajouté à Scolarité (order ${nOrder + 0.5})`);
  } else {
    log.push("student classe: déjà présent");
  }

  console.log(log.map((l) => "  " + l).join("\n"));
  if (!CONFIRM) { console.log("\nDry-run. --confirm pour écrire."); await prisma.$disconnect(); return; }
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      parentFieldsConfig: pCfg as unknown as Prisma.InputJsonValue,
      studentFieldsConfig: sCfg as unknown as Prisma.InputJsonValue,
    },
  });
  console.log("✓ Configs mis à jour.");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

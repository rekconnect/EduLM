/**
 * Surgical migration + backfill for the Arabic address town/caza (البلدة /
 * القضاء) — the two Dars address parts the fiche's "Info Arabe" was missing.
 *
 * 1. Adds `adresse_village_ar` + `adresse_qaza_ar` to the LIVE
 *    parentFieldsConfig "Info Arabe" category (preserving every existing
 *    field / override / order — does NOT overwrite like the seeder).
 *    Config-driven surfaces pick them up automatically: the admin parent
 *    fiche AND the inscription/réinscription form's Responsables tab.
 * 2. Backfills all imported parents (User.darsParentId) from
 *    Isc_Address.Id_Town → Isc_Town.TownNameAR and Id_Qaza → Isc_Qaza.QazaAR.
 *    phase1c-enrich now also writes these keys on every re-import.
 *
 * Idempotent. DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/add-arabic-address-fields.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const CAT = "Info Arabe";
const FIELDS = [
  { key: "adresse_village_ar", label: "البلدة (Village AR)" },
  { key: "adresse_qaza_ar", label: "القضاء (Qaza AR)" },
];

type Cat = { id: string; name: string };
type Field = { id?: string; key?: string; order?: number };
type Config = { categories: Cat[]; fields: Field[] };

const clean = (v: unknown) => String(v ?? "").trim();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  // ── 1. Config migration ──
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { parentFieldsConfig: true },
  });
  const cfg = t?.parentFieldsConfig as unknown as Config | null;
  if (!cfg || !Array.isArray(cfg.fields) || !Array.isArray(cfg.categories)) {
    console.error("No usable parentFieldsConfig found.");
    process.exit(1);
  }
  const cat = cfg.categories.find((c) => c.name === CAT);
  if (!cat) {
    console.error(`Category "${CAT}" not found in parentFieldsConfig.`);
    process.exit(1);
  }
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
      type: "short_text",
      required: false,
      active: true,
      categoryId: cat.id,
      order,
    });
    added.push(f.key);
  }
  console.log(`Config: fields to add → [${added.join(", ") || "aucun (déjà présents)"}]`);

  // ── 2. Backfill values from Dars ──
  const rows = await darsQuery<{ ID_Parent: number; TownAR: string | null; QazaAR: string | null }>(
    `SELECT p.ID_Parent, t.TownNameAR AS TownAR, q.QazaAR
     FROM Isc_Parent p
     JOIN Isc_Address a ON a.ID = p.Id_Address
     LEFT JOIN Isc_Town t ON t.Id_Town = a.Id_Town
     LEFT JOIN Isc_Qaza q ON q.ID = a.Id_Qaza
     WHERE p.Id_College=${C}`,
  );
  const byParent = new Map<number, { village: string; qaza: string }>();
  const noDash = (v: unknown) => (clean(v) === "--" ? "" : clean(v));
  for (const r of rows) {
    byParent.set(Number(r.ID_Parent), { village: noDash(r.TownAR), qaza: noDash(r.QazaAR) });
  }

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, darsParentId: { not: null } },
    select: { id: true, name: true, darsParentId: true, customAnswers: true },
  });
  type Update = { id: string; ca: Prisma.InputJsonValue; label: string };
  const updates: Update[] = [];
  for (const u of users) {
    const d = byParent.get(Number(u.darsParentId));
    if (!d || (!d.village && !d.qaza)) continue;
    const ca = { ...((u.customAnswers ?? {}) as Record<string, unknown>) };
    let changed = false;
    if (d.village && ca.adresse_village_ar !== d.village) { ca.adresse_village_ar = d.village; changed = true; }
    if (d.qaza && ca.adresse_qaza_ar !== d.qaza) { ca.adresse_qaza_ar = d.qaza; changed = true; }
    if (!changed) continue;
    updates.push({ id: u.id, ca: ca as Prisma.InputJsonValue, label: `${u.name} — ${d.village} / ${d.qaza}` });
  }
  console.log(`Parents à remplir: ${updates.length} / ${users.length}`);
  for (const u of updates.slice(0, 8)) console.log(`  + ${u.label}`);
  if (updates.length > 8) console.log(`  … (+${updates.length - 8} autres)`);

  if (!CONFIRM) {
    console.log("\nDry-run. Relancer avec --confirm pour écrire.");
    await prisma.$disconnect();
    await closeDars();
    return;
  }

  if (added.length) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { parentFieldsConfig: { ...cfg, fields: newFields } as unknown as Prisma.InputJsonValue },
    });
    console.log("✓ Config mise à jour.");
  }
  let done = 0;
  const SZ = 10;
  for (let i = 0; i < updates.length; i += SZ) {
    await Promise.all(
      updates.slice(i, i + SZ).map((u) =>
        prisma.user.update({ where: { id: u.id }, data: { customAnswers: u.ca } }),
      ),
    );
    done += Math.min(SZ, updates.length - i);
    process.stdout.write(`\r  ${done}/${updates.length}`);
  }
  console.log(`\n✓ ${updates.length} parents remplis.`);
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

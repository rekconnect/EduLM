// Make the parent address Qaza/Village cascading dropdowns in a tenant's
// parentFieldsConfig: adresse_qaza → lebanon_region, adresse_village →
// lebanon_town_for_kaza (optionsSource: adresse_qaza). Dry-run unless --confirm.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const slug = (process.argv.find((a) => a.startsWith("--slug=")) || "--slug=montaigne").split("=")[1];
(async () => {
  const t = await p.tenant.findFirst({ where: { slug }, select: { id: true, parentFieldsConfig: true } });
  if (!t) { console.error("tenant not found:", slug); process.exit(1); }
  const cfg = typeof t.parentFieldsConfig === "string" ? JSON.parse(t.parentFieldsConfig) : t.parentFieldsConfig;
  let changed = 0;
  for (const f of cfg.fields || []) {
    if (f.id === "adresse_qaza") {
      f.type = "lebanon_region"; delete f.options; changed++;
      console.log("adresse_qaza  -> type lebanon_region");
    }
    if (f.id === "adresse_village") {
      f.type = "lebanon_town_for_kaza"; f.optionsSource = { fieldId: "adresse_qaza" }; delete f.options; changed++;
      console.log("adresse_village -> type lebanon_town_for_kaza (source: adresse_qaza)");
    }
  }
  console.log(`\n${changed} fields ${CONFIRM ? "updated" : "(dry-run)"} for ${slug}.`);
  if (CONFIRM && changed) await p.tenant.update({ where: { id: t.id }, data: { parentFieldsConfig: cfg } });
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());

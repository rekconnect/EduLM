// Restructure Montaigne fields:
//  STUDENT: add a "Sexe" select right after Date de naissance.
//  PARENT : group the registre fields under a new "Adresse de registre"
//           category — Numéro du registre, Qaza du registre, Village du registre.
// Dry-run unless --confirm.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const slug = "montaigne";

function catId(cfg, name) {
  return (cfg.categories || []).find((c) => c.name === name)?.id;
}
function field(cfg, id) {
  return (cfg.fields || []).find((f) => f.id === id);
}

(async () => {
  const t = await p.tenant.findFirst({
    where: { slug },
    select: { id: true, studentFieldsConfig: true, parentFieldsConfig: true },
  });
  if (!t) { console.error("tenant not found"); process.exit(1); }
  const sc = typeof t.studentFieldsConfig === "string" ? JSON.parse(t.studentFieldsConfig) : t.studentFieldsConfig;
  const pc = typeof t.parentFieldsConfig === "string" ? JSON.parse(t.parentFieldsConfig) : t.parentFieldsConfig;

  // ── STUDENT: Sexe after Date de naissance ──
  const infoGenId = catId(sc, "Info générale");
  const dob = field(sc, "date_naissance");
  if (!field(sc, "sexe") && infoGenId && dob) {
    sc.fields.push({
      id: "sexe", key: "sexe", label: "Sexe", type: "select",
      options: ["Garçon", "Fille", "Autre"], required: false,
      categoryId: infoGenId, order: (dob.order ?? 0) + 0.5, active: true,
    });
    console.log("STUDENT: added 'sexe' after date_naissance (order", (dob.order ?? 0) + 0.5, ")");
  } else {
    console.log("STUDENT: sexe already present or category/date missing — skipped");
  }

  // ── PARENT: Adresse de registre group ──
  let regCat = (pc.categories || []).find((c) => c.name === "Adresse de registre");
  if (!regCat) {
    const adresseOrder = (pc.categories || []).find((c) => c.name === "Adresse")?.order;
    const order = typeof adresseOrder === "number"
      ? adresseOrder + 0.5
      : Math.max(0, ...(pc.categories || []).map((c) => c.order ?? 0)) + 1;
    regCat = { id: "adresse_registre", name: "Adresse de registre", order, active: true };
    pc.categories.push(regCat);
    console.log("PARENT: created category 'Adresse de registre' (order", order, ")");
  }
  const relabels = [
    ["numero_registre", "Numéro du registre", 0],
    ["caza_registre", "Qaza du registre", 1],
    ["lieu_registre", "Village du registre", 2],
  ];
  for (const [id, label, order] of relabels) {
    const f = field(pc, id);
    if (!f) { console.log("  PARENT field NOT FOUND:", id); continue; }
    f.categoryId = regCat.id; f.label = label; f.order = order;
    console.log(`  PARENT: ${id} -> "${label}" (cat Adresse de registre, order ${order})`);
  }

  console.log(`\n${CONFIRM ? "WRITING" : "Dry-run"}.`);
  if (CONFIRM) {
    await p.tenant.update({ where: { id: t.id }, data: { studentFieldsConfig: sc, parentFieldsConfig: pc } });
    console.log("Written.");
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());

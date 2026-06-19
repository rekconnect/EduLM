// Fix non-integer order values (schema requires integers) by renumbering
// categories 0..N and each category's fields 0..M, preserving current order.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const slug = "montaigne";

function normalize(cfg) {
  const cats = [...(cfg.categories || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  cats.forEach((c, i) => (c.order = i));
  for (const cat of cats) {
    const fs = (cfg.fields || [])
      .filter((f) => f.categoryId === cat.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    fs.forEach((f, i) => (f.order = i));
  }
  return cfg;
}

(async () => {
  const t = await p.tenant.findFirst({
    where: { slug },
    select: { id: true, parentFieldsConfig: true, studentFieldsConfig: true },
  });
  const pc = normalize(typeof t.parentFieldsConfig === "string" ? JSON.parse(t.parentFieldsConfig) : t.parentFieldsConfig);
  const sc = normalize(typeof t.studentFieldsConfig === "string" ? JSON.parse(t.studentFieldsConfig) : t.studentFieldsConfig);
  const frac = (cfg) =>
    [...(cfg.categories || []).map((c) => c.order), ...(cfg.fields || []).map((f) => f.order)].filter((o) => !Number.isInteger(o));
  console.log("parent remaining fractional:", frac(pc).length, "| student:", frac(sc).length);
  if (CONFIRM) {
    await p.tenant.update({ where: { id: t.id }, data: { parentFieldsConfig: pc, studentFieldsConfig: sc } });
    console.log("WRITTEN.");
  } else {
    console.log("Dry-run. Re-run with --confirm.");
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());

// Mark fields as "fiche only" (formHidden=true) — hidden from the parent
// inscription form, kept on the fiche. Dry-run unless --confirm.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const slug = (process.argv.find((a) => a.startsWith("--slug=")) || "--slug=montaigne").split("=")[1];
const entity = (process.argv.find((a) => a.startsWith("--entity=")) || "--entity=student").split("=")[1];
const ids = (process.argv.find((a) => a.startsWith("--ids=")) || "--ids=dars_student_code,communaute_eleve,registerNum").split("=")[1].split(",");
const col = entity === "parent" ? "parentFieldsConfig" : "studentFieldsConfig";
(async () => {
  const t = await p.tenant.findFirst({ where: { slug }, select: { id: true, [col]: true } });
  if (!t) { console.error("tenant not found:", slug); process.exit(1); }
  const cfg = typeof t[col] === "string" ? JSON.parse(t[col]) : t[col];
  let changed = 0;
  for (const f of cfg.fields || []) {
    if (ids.includes(f.id)) { f.formHidden = true; changed++; console.log("formHidden=true ->", f.id, `(${f.label})`); }
  }
  const missing = ids.filter((id) => !(cfg.fields || []).some((f) => f.id === id));
  if (missing.length) console.log("NOT FOUND:", missing.join(", "));
  console.log(`\n${changed} fields ${CONFIRM ? "updated" : "(dry-run)"} on ${slug}/${entity}.`);
  if (CONFIRM && changed) await p.tenant.update({ where: { id: t.id }, data: { [col]: cfg } });
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => p.$disconnect());

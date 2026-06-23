/**
 * Recode any "LM-" prefixed family codes to plain Dars-style numbers, and
 * (re)assign each family's kids a code = newFamilyCode + 1-based index.
 * Consumes numbers from the tenant's familyCodeNextSequence and bumps it.
 * Dry-run by default; --confirm to write.
 *
 *   DATABASE_URL=$DIRECT_URL node scripts/dars-import/recode-lm-families.cjs --tenant-name="Lycée Montaigne" [--confirm]
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}
const CONFIRM = process.argv.includes("--confirm");
const TENANT_NAME = arg("tenant-name", "Lycée Montaigne");
const KEY = "dars_student_code";

(async () => {
  const t = await prisma.tenant.findFirst({
    where: { name: TENANT_NAME },
    select: { id: true, name: true, familyCodeNextSequence: true },
  });
  if (!t) { console.error(`Tenant "${TENANT_NAME}" not found`); process.exit(1); }

  const fams = await prisma.family.findMany({
    where: { tenantId: t.id, code: { contains: "LM" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, code: true, name: true,
      students: { orderBy: { createdAt: "asc" }, select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!fams.length) { console.log("No LM- families. Nothing to do."); await prisma.$disconnect(); return; }

  let seq = t.familyCodeNextSequence;
  const plan = fams.map((f) => {
    const newCode = String(seq++);
    return {
      famId: f.id, oldCode: f.code, name: f.name, newCode,
      kids: f.students.map((s, i) => ({
        id: s.id, label: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim(), kidCode: `${newCode}${i + 1}`,
      })),
    };
  });

  console.log(`Tenant: ${t.name}`);
  for (const p of plan) {
    console.log(`\n  ${p.oldCode} → ${p.newCode}  ${p.name ? `(${p.name})` : ""}`);
    p.kids.forEach((k) => console.log(`      ${k.label} → ${k.kidCode}`));
    if (!p.kids.length) console.log("      (no students)");
  }
  console.log(`\n  familyCodeNextSequence: ${t.familyCodeNextSequence} → ${seq}`);

  if (!CONFIRM) { console.log("\nDry run. Re-run with --confirm to apply."); await prisma.$disconnect(); return; }

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx.family.update({ where: { id: p.famId }, data: { code: p.newCode } });
      for (const k of p.kids) {
        const s = await tx.student.findUnique({ where: { id: k.id }, select: { customAnswers: true } });
        const ca = (s?.customAnswers && typeof s.customAnswers === "object") ? { ...s.customAnswers } : {};
        ca[KEY] = k.kidCode;
        await tx.student.update({ where: { id: k.id }, data: { customAnswers: ca } });
      }
    }
    await tx.tenant.update({ where: { id: t.id }, data: { familyCodeNextSequence: seq } });
  });
  console.log("\n✓ Applied.");
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

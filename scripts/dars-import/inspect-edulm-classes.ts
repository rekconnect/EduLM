import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  const years = await p.academicYear.findMany({
    select: { id: true, label: true, isActive: true },
    orderBy: { label: "asc" },
  });
  console.log("EduLM Academic Years:");
  for (const y of years) console.log(`  ${y.label}${y.isActive ? " [active]" : ""}  id=${y.id}`);

  const classes = await p.class.findMany({
    select: { level: true, section: true, name: true, academicYear: { select: { label: true } } },
    orderBy: [{ academicYearId: "asc" }, { level: "asc" }],
  });
  console.log(`\nEduLM Classes (${classes.length}):`);
  const byYear: Record<string, string[]> = {};
  for (const c of classes) {
    const y = c.academicYear.label;
    (byYear[y] ||= []).push(`${c.level} / ${c.section}  "${c.name}"`);
  }
  for (const [y, list] of Object.entries(byYear)) {
    console.log(`\n  ── ${y} (${list.length} classes) ──`);
    for (const l of list) console.log(`     ${l}`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

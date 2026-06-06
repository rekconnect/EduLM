import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const T = t!.id;

  // count students with a non-empty services_by_year
  const all = await p.student.findMany({
    where: { tenantId: T, status: "ENROLLED", darsStudentId: { not: null } },
    select: {
      firstName: true, lastName: true, customAnswers: true,
      enrollments: {
        select: { class: { select: { name: true } }, academicYear: { select: { label: true, startDate: true } } },
        orderBy: { academicYear: { startDate: "desc" } },
      },
    },
  });
  const parse = (ca: unknown) => {
    try { return JSON.parse((ca as Record<string, string>)?.services_by_year ?? "{}") as Record<string, string>; }
    catch { return {}; }
  };
  const withSvc = all.filter((s) => Object.keys(parse(s.customAnswers)).length >= 2);
  console.log(`Enrolled students with services in 2+ years: ${withSvc.length}\n`);

  // show 2 rich examples
  for (const s of withSvc.sort((a, b) => b.enrollments.length - a.enrollments.length).slice(0, 2)) {
    const svc = parse(s.customAnswers);
    console.log(`══ ${s.firstName} ${s.lastName} ══`);
    for (const e of s.enrollments) {
      console.log(`  ${e.academicYear.label}   ${e.class.name.padEnd(14)}   ${svc[e.academicYear.label] ?? "—"}`);
    }
    console.log("");
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

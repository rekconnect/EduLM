import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  // Pick a current student with the most enrollment years.
  const cand = await p.student.findMany({
    where: { tenantId: t!.id, status: "ENROLLED", darsStudentId: { not: null } },
    select: {
      firstName: true, lastName: true, customAnswers: true,
      enrollments: {
        select: { class: { select: { name: true } }, academicYear: { select: { label: true, startDate: true } } },
        orderBy: { academicYear: { startDate: "desc" } },
      },
    },
    take: 200,
  });
  const s = cand.sort((a, b) => b.enrollments.length - a.enrollments.length)[0]!;
  const svc = (() => {
    try { return JSON.parse((s.customAnswers as Record<string, string>)?.services_by_year ?? "{}"); } catch { return {}; }
  })() as Record<string, string>;

  console.log(`\n══ Parcours — ${s.firstName} ${s.lastName} (${s.enrollments.length} years) ══\n`);
  for (const e of s.enrollments) {
    console.log(`  ${e.academicYear.label}   ${(e.class.name).padEnd(14)}   ${svc[e.academicYear.label] ?? "—"}`);
  }

  // overall counts
  const totals = await p.enrollment.count({ where: { tenantId: t!.id } });
  const years = await p.academicYear.count({ where: { tenantId: t!.id } });
  console.log(`\nTotal enrollments: ${totals} · academic years: ${years}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

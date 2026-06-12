/** Read-only: do the 10 liste-only students exist in EduLM (as students at all)? */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const TEN = [
  "Aziz Ayla", "Aziz Celia", "KHOURY Chris", "MAROUN Charles", "RIACHY Ivana",
  "RIACHY John-Paul", "RIACHY Matthew", "NASSIF Elya", "HAJJAR Gabriel", "JABBOUR Maria",
];
const deburr = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: {
      firstName: true, lastName: true, customAnswers: true,
      enrollments: { select: { class: { select: { name: true } }, academicYear: { select: { label: true } } } },
    },
  });
  for (const q of TEN) {
    const [ln, fn] = q.split(" ");
    const hits = students.filter(
      (s) => deburr(s.lastName).includes(deburr(ln!)) && deburr(s.firstName).includes(deburr(fn!)),
    );
    if (!hits.length) {
      console.log(`✗ ${q}: AUCUN élève EduLM`);
      continue;
    }
    for (const h of hits) {
      const ca = (h.customAnswers ?? {}) as Record<string, unknown>;
      const cls = h.enrollments.find((e) => e.academicYear.label === "2025-2026")?.class.name ?? "—";
      let assigned = false;
      try {
        const p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)["2025-2026|T3"];
        assigned = !!p && (p.as === "yes" || p.rs === "yes");
      } catch { /* ignore */ }
      console.log(`✓ ${q} → ${h.lastName} ${h.firstName} (${cls}) [code ${ca.dars_student_code ?? "—"}] — bus T3: ${assigned ? "OUI" : "non"}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

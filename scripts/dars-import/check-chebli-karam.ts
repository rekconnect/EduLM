/** Read-only: find Chebli Célia and Karam Cecilia in EduLM (+ bus T3 status). */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.student.findMany({
    where: {
      OR: [
        { lastName: { contains: "chebli", mode: "insensitive" } },
        { AND: [{ lastName: { contains: "karam", mode: "insensitive" } }, { firstName: { contains: "c", mode: "insensitive" } }] },
      ],
    },
    select: { firstName: true, lastName: true, customAnswers: true },
  });
  for (const s of r) {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    let bus = "—";
    try {
      const p = (JSON.parse(String(ca.bus_periods ?? "{}")) as Record<string, Record<string, string>>)["2025-2026|T3"];
      if (p && (p.as === "yes" || p.rs === "yes"))
        bus = `AS:${p.car_matin || "·"} RS:${p.car_soir || "·"} rem:"${p.remarques ?? ""}"`;
    } catch { /* ignore */ }
    console.log(`${s.lastName} | ${s.firstName} — ${bus}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/** Read-only: the Ibrahim renewal draft's responsable rows + their customAnswers. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const st = await prisma.student.findFirst({
    where: { tenantId: tenant.id, lastName: { contains: "ibrahim", mode: "insensitive" }, firstName: { contains: "george", mode: "insensitive" } },
    select: { id: true },
  });
  if (!st) { console.log("no student"); return; }
  const app = await prisma.application.findFirst({
    where: { existingStudentId: st.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true,
      responsables: { orderBy: { order: "asc" }, select: { id: true, kind: true, firstName: true, lastName: true, customAnswers: true } },
    },
  });
  console.log("Draft:", app?.id, app?.status);
  console.log("Responsable rows:", app?.responsables.length);
  for (const r of app?.responsables ?? []) {
    const ca = (r.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`  [${r.kind}] ${r.firstName ?? ""} ${r.lastName ?? ""} — customAnswers keys: ${Object.keys(ca).length} → ${Object.keys(ca).join(", ")}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

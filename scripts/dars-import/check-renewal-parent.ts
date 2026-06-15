/** Read-only: why are parent fields empty on the Ibrahim renewal?
 *  Shows the draft's submitter, that user's customAnswers, the draft's
 *  current parentAnswers, and each guardian's customAnswers. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const st = await prisma.student.findFirst({
    where: { tenantId: tenant.id, lastName: { contains: "ibrahim", mode: "insensitive" }, firstName: { contains: "george", mode: "insensitive" } },
    select: {
      id: true,
      guardianLinks: {
        select: {
          isPrimary: true,
          guardian: {
            select: {
              relation: true,
              user: { select: { id: true, email: true, customAnswers: true } },
            },
          },
        },
      },
    },
  });
  if (!st) { console.log("no student"); return; }

  const app = await prisma.application.findFirst({
    where: { existingStudentId: st.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, submittedByUserId: true, parentAnswers: true },
  });
  console.log("Renewal draft:", app?.id, app?.status);
  const pa = (app?.parentAnswers ?? {}) as Record<string, unknown>;
  console.log("  parentAnswers keys:", Object.keys(pa).length, JSON.stringify(pa).slice(0, 200));

  console.log("\nGuardians of the student:");
  for (const l of st.guardianLinks) {
    const u = l.guardian.user;
    const ca = (u.customAnswers ?? {}) as Record<string, unknown>;
    const strKeys = Object.keys(ca).filter((k) => typeof ca[k] === "string" && (ca[k] as string).trim());
    console.log(`  [${l.guardian.relation}${l.isPrimary ? " PRIMARY" : ""}] ${u.email} (id ${u.id})`);
    console.log(`     customAnswers string keys (${strKeys.length}): ${strKeys.join(", ")}`);
    console.log(`     is submitter? ${u.id === app?.submittedByUserId}`);
  }

  if (app?.submittedByUserId) {
    const submitter = await prisma.user.findUnique({
      where: { id: app.submittedByUserId },
      select: { email: true, customAnswers: true },
    });
    const ca = (submitter?.customAnswers ?? {}) as Record<string, unknown>;
    const strKeys = Object.keys(ca).filter((k) => typeof ca[k] === "string" && (ca[k] as string).trim());
    console.log(`\nSubmitter (${submitter?.email}) customAnswers string keys (${strKeys.length}): ${strKeys.join(", ")}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

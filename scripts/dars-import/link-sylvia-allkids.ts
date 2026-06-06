/**
 * Link Sylvia's single ENABLED account (dars 13793, Ibrahim) to her Masrouha
 * kids too, so one login shows all 4 children in the parent portal.
 * (EduLM ties one account to one family, so she can't have 2 active accounts
 * sharing an email — this gives her the same practical access from one login.)
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const sylvia = await prisma.user.findFirst({
    where: { tenantId: T, darsParentId: 13793 },
    select: { email: true, status: true, guardianProfile: { select: { id: true } } },
  });
  const masrouhaKids = await prisma.student.findMany({
    where: { tenantId: T, darsStudentId: { in: [2031, 2032] } },
    select: { id: true, firstName: true, lastName: true },
  });

  console.log("Sylvia enabled account:", sylvia?.email, `(${sylvia?.status})`, "guardian:", sylvia?.guardianProfile?.id);
  console.log("Masrouha kids:", masrouhaKids.map((k) => `${k.firstName} ${k.lastName}`).join(", "));

  if (!sylvia?.guardianProfile) { console.log("No guardian — abort."); await prisma.$disconnect(); return; }
  const gid = sylvia.guardianProfile.id;

  // Already-linked?
  const existing = await prisma.studentGuardian.findMany({
    where: { guardianId: gid, studentId: { in: masrouhaKids.map((k) => k.id) } },
    select: { studentId: true },
  });
  const have = new Set(existing.map((e) => e.studentId));
  const toLink = masrouhaKids.filter((k) => !have.has(k.id));
  console.log(`\nWill add ${toLink.length} link(s): ${toLink.map((k) => k.firstName).join(", ")}`);

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  for (const k of toLink) {
    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: k.id, guardianId: gid } },
      update: {},
      create: { studentId: k.id, guardianId: gid, isPrimary: false },
    });
  }
  console.log("✓ Sylvia's account now linked to all her children.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

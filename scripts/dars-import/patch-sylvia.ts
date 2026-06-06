/**
 * One-off patch for Sylvia Saade (blended family + Dars duplicate):
 *  1. Move her real email (sylviasaade@gmail.com) from the OLD duplicate
 *     Ibrahim record (dars 12820) to her CURRENT Ibrahim record (dars 13793).
 *  2. Enable 13793 (ACTIVE + shared default password + force change) so the
 *     current Ibrahim family (I0008) has a real login.
 *  3. Delete the duplicate OLD Ibrahim cluster — students 104 & 779 (withdrawn
 *     re-entries of 2017/2018), old parents 339 & 12820, and family 506 —
 *     leaving the 2 real codes (I0008 + M0048), matching Dars.
 *
 * The Masrouha family (M0048) already has its active contact (father Rabih),
 * so it's untouched.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const REAL_EMAIL = "sylviasaade@gmail.com";
const PASSWORD = "Montaigne2026";

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const oldMom = await prisma.user.findFirst({ where: { tenantId: T, darsParentId: 12820 }, select: { id: true, email: true } });
  const curMom = await prisma.user.findFirst({ where: { tenantId: T, darsParentId: 13793 }, select: { id: true, email: true } });
  const oldDad = await prisma.user.findFirst({ where: { tenantId: T, darsParentId: 339 }, select: { id: true } });
  const oldKids = await prisma.student.findMany({ where: { tenantId: T, darsStudentId: { in: [104, 779] } }, select: { id: true, firstName: true, lastName: true } });
  const fam506 = await prisma.family.findFirst({ where: { tenantId: T, code: "506" }, select: { id: true } });

  console.log("Found:");
  console.log("  old Ibrahim mother (12820):", oldMom?.email);
  console.log("  current Ibrahim mother (13793):", curMom?.email);
  console.log("  old Ibrahim father (339):", oldDad?.id ? "yes" : "no");
  console.log("  old duplicate students:", oldKids.map((k) => `${k.firstName} ${k.lastName}`).join(", "));
  console.log("  family 506:", fam506?.id ? "yes" : "no");

  console.log("\nPlan:");
  console.log(`  1. ${oldMom?.email} → placeholder (free the email)`);
  console.log(`  2. set ${REAL_EMAIL} on current Ibrahim mother + ENABLE (password "${PASSWORD}", force change)`);
  console.log(`  3. delete ${oldKids.length} old students, old parents (339, 12820), family 506`);

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }
  if (!oldMom || !curMom) {
    console.log("Missing required accounts — aborting.");
    await prisma.$disconnect();
    return;
  }

  // 1. free the email from the old record
  await prisma.user.update({ where: { id: oldMom.id }, data: { email: "dars-parent-12820@import.lyceemontaigne.local" } });
  // 2. real email + enable on the current Ibrahim mother
  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.update({
    where: { id: curMom.id },
    data: { email: REAL_EMAIL, status: "ACTIVE", passwordHash: hash, mustChangePassword: true },
  });
  // 3. delete the duplicate old cluster
  if (oldKids.length) {
    await prisma.student.deleteMany({ where: { id: { in: oldKids.map((k) => k.id) } } });
  }
  await prisma.user.deleteMany({ where: { tenantId: T, darsParentId: { in: [339, 12820] } } });
  if (fam506) await prisma.family.delete({ where: { id: fam506.id } });

  console.log("\n✓ Patch applied. Sylvia: 2 codes (I0008 + M0048); current Ibrahim account enabled.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

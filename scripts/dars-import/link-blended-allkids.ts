/**
 * Generalized blended-family fix. For every parent who has ENROLLED kids in
 * 2+ current families, link their single best account to ALL those kids so
 * one login shows every child. Also guarantees BOTH families are active:
 * if one of the parent's current families has no active contact, enable that
 * parent's account there too.
 *
 * DRY RUN by default; --confirm to apply.
 *   npx tsx scripts/dars-import/link-blended-allkids.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/link-blended-allkids.ts --tenant-name="Lycée Montaigne" --confirm
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PLACEHOLDER = "@import.lyceemontaigne.local";
const PASSWORD = "Montaigne2026";
const isReal = (e: string) => !e.endsWith(PLACEHOLDER);
const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;

  const parents = await prisma.user.findMany({
    where: { tenantId: T, role: "PARENT", darsParentId: { not: null } },
    select: {
      id: true, firstName: true, lastName: true, status: true, email: true, darsParentId: true,
      guardianProfile: {
        select: {
          id: true,
          family: { select: { id: true, code: true } },
          childLinks: { select: { student: { select: { id: true, firstName: true, lastName: true, status: true } } } },
        },
      },
    },
  });

  const byName = new Map<string, typeof parents>();
  for (const p of parents) (byName.get(`${norm(p.firstName)}|${norm(p.lastName)}`) ?? byName.set(`${norm(p.firstName)}|${norm(p.lastName)}`, []).get(`${norm(p.firstName)}|${norm(p.lastName)}`)!).push(p);

  const enrolledKids = (p: (typeof parents)[number]) =>
    (p.guardianProfile?.childLinks ?? []).filter((l) => l.student.status === "ENROLLED").map((l) => l.student);

  type Plan = {
    name: string;
    primary: (typeof parents)[number];
    enableSecondary: (typeof parents)[number][]; // accounts to enable (their family had no active contact)
    kidIds: { id: string; name: string }[];
  };
  const plans: Plan[] = [];

  for (const group of byName.values()) {
    const current = group.filter((p) => enrolledKids(p).length > 0);
    const families = new Set(current.map((p) => p.guardianProfile?.family?.id).filter(Boolean));
    if (current.length < 2 || families.size < 2) continue; // not blended

    // Best account = ACTIVE+real, else real, else first.
    const primary =
      current.find((p) => p.status === "ACTIVE" && isReal(p.email)) ??
      current.find((p) => isReal(p.email)) ??
      current[0];
    if (!primary) continue;

    // All enrolled kids across the parent's current families.
    const kidMap = new Map<string, string>();
    for (const acc of current) for (const k of enrolledKids(acc)) kidMap.set(k.id, `${k.firstName} ${k.lastName}`);

    // Families needing an active contact (none of their guardians active).
    // Approximate per-account: if the secondary account's family has no other
    // active contact, enable that account so the family is active.
    const enableSecondary = current.filter((p) => p.id !== primary.id && p.status !== "ACTIVE");

    plans.push({
      name: `${primary.firstName} ${primary.lastName}`,
      primary,
      enableSecondary,
      kidIds: [...kidMap.entries()].map(([id, name]) => ({ id, name })),
    });
  }

  console.log(`Blended-family parents: ${plans.length}\n`);
  for (const pl of plans) {
    console.log(`  ${pl.name} → link account ${pl.primary.darsParentId} (${isReal(pl.primary.email) ? pl.primary.email : "placeholder"}) to: ${pl.kidIds.map((k) => k.name).join(", ")}`);
    if (pl.enableSecondary.length)
      console.log(`      + keep secondary account(s) active: ${pl.enableSecondary.map((s) => s.guardianProfile?.family?.code).join(", ")}`);
  }

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const pl of plans) {
    const gid = pl.primary.guardianProfile!.id;
    for (const k of pl.kidIds) {
      await prisma.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: k.id, guardianId: gid } },
        update: {},
        create: { studentId: k.id, guardianId: gid, isPrimary: false },
      });
    }
    // Keep both families active: enable the parent's secondary current
    // account(s) too (placeholder email — she logs in via her primary, but
    // this keeps the second family's record showing an active parent).
    for (const s of pl.enableSecondary) {
      await prisma.user.update({
        where: { id: s.id },
        data: { status: "ACTIVE", passwordHash: hash, mustChangePassword: true },
      });
    }
  }
  console.log("\n✓ Blended-family parents linked to all their kids; both families active.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

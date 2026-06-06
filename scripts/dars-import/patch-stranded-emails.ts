/**
 * Stage 1 cleanup — generalized Sylvia fix. For every parent whose REAL
 * email is stranded on an all-withdrawn record while their ENROLLED record
 * has only a placeholder, move the email to the enrolled record and ENABLE
 * it (shared default password + force change). Non-destructive.
 *
 * DRY RUN by default; --confirm to apply.
 *   npx tsx scripts/dars-import/patch-stranded-emails.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/patch-stranded-emails.ts --tenant-name="Lycée Montaigne" --confirm
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
        select: { family: { select: { code: true } }, childLinks: { select: { student: { select: { status: true } } } } },
      },
    },
  });

  const byName = new Map<string, typeof parents>();
  for (const p of parents) {
    const k = `${norm(p.firstName)}|${norm(p.lastName)}`;
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
  }

  type Case = { name: string; from: (typeof parents)[number]; to: (typeof parents)[number] };
  const cases: Case[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const realWithdrawn = group.find(
      (p) =>
        isReal(p.email) &&
        (p.guardianProfile?.childLinks ?? []).length > 0 &&
        (p.guardianProfile?.childLinks ?? []).every((l) => l.student.status !== "ENROLLED"),
    );
    const enrolledPlaceholder = group.find(
      (p) => !isReal(p.email) && (p.guardianProfile?.childLinks ?? []).some((l) => l.student.status === "ENROLLED"),
    );
    if (realWithdrawn && enrolledPlaceholder) {
      cases.push({ name: `${realWithdrawn.firstName} ${realWithdrawn.lastName}`, from: realWithdrawn, to: enrolledPlaceholder });
    }
  }

  console.log(`Stranded-email cases: ${cases.length}\n`);
  for (const c of cases) {
    console.log(`  ${c.name}: ${c.from.email} (dars ${c.from.darsParentId}, withdrawn) → dars ${c.to.darsParentId} (fam ${c.to.guardianProfile?.family?.code}) + ENABLE`);
  }

  if (!confirm) {
    console.log("\n🟡 DRY RUN — re-run with --confirm to apply.");
    await prisma.$disconnect();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  let done = 0;
  for (const c of cases) {
    const realEmail = c.from.email;
    // free the old record's email first (avoid unique collision)
    await prisma.user.update({
      where: { id: c.from.id },
      data: { email: `dars-parent-${c.from.darsParentId}${PLACEHOLDER}` },
    });
    // move email + enable on the enrolled record
    await prisma.user.update({
      where: { id: c.to.id },
      data: { email: realEmail, status: "ACTIVE", passwordHash: hash, mustChangePassword: true },
    });
    done++;
    process.stdout.write(`\r  patched: ${done}/${cases.length}`);
  }
  process.stdout.write("\n✓ Stage 1 complete — stranded emails moved + accounts enabled.\n");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

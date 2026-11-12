/**
 * One-off data correction — legacy public sign-ups that wrongly look
 * "e-mail verified".
 *
 * Until the deploy of 2026-11-05 the public sign-up form stamped
 * `emailVerified = now()` on every account it created, although nobody had
 * confirmed the address (verification by e-mail does not exist yet). Since
 * then the form leaves it null, and Admissions / Parents derive the
 * "E-mail non vérifié" badge from that null. The older rows therefore show NO
 * badge and read as verified next to the newer ones.
 *
 * This script resets `emailVerified` to null on accounts that are ALL of:
 *   - PENDING — not confirmed by the school (same predicate as the consoles:
 *     no Dars id, no staff role, no Microsoft sign-in, no child linked…);
 *   - created before the cutoff, with a password and a non-null emailVerified;
 *   - created by the PUBLIC form: no guardian row (old single-parent form) or
 *     a family named "Famille <nom>" (family form).
 * Pending accounts created by an admin in the Parents console (family without
 * a name) are LISTED but never changed: there the school typed the address
 * itself. Confirmed parents are never looked at.
 *
 * `emailVerified` is not read by sign-in or by any permission check — the only
 * effect is the badge.
 *
 * DRY RUN by default — it prints exactly what --confirm would write. Writing
 * requires --tenant, so a demo tenant full of seeded accounts is never
 * touched by accident. E-mail addresses are masked unless --full is passed.
 *
 *   npx tsx scripts/backfill-signup-email-unverified.ts
 *   npx tsx scripts/backfill-signup-email-unverified.ts --tenant montaigne --confirm
 */
import { PrismaClient } from "@prisma/client";
import { PENDING_PARENT_WHERE } from "../src/app/(app)/admin/parents/_pending";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

const CONFIRM = process.argv.includes("--confirm");
const FULL = process.argv.includes("--full");
const TENANT = arg("tenant");

// The form stopped faking the date with the deploy of 2026-11-05. The cutoff
// also protects the future: once verification by e-mail ships, accounts that
// confirm their address are created after it, so re-running this script can
// never undo a genuine verification.
const CUTOFF = new Date("2026-11-06T00:00:00Z");

const mask = (email: string) =>
  FULL ? email : email.replace(/^(.{2}).*(@.*)$/, "$1***$2");

type Origin = "public-form" | "school-created";

async function main() {
  console.log(
    CONFIRM ? "== WRITE mode ==" : "== DRY-RUN (pass --confirm to write) ==",
  );
  if (CONFIRM && !TENANT) {
    console.error("--confirm requires --tenant <slug>. Nothing written.");
    process.exitCode = 1;
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: TENANT ? { slug: TENANT } : {},
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });
  if (tenants.length === 0) {
    console.error(`No tenant matches "${TENANT}". Nothing written.`);
    process.exitCode = 1;
    return;
  }

  for (const tenant of tenants) {
    const rows = await prisma.user.findMany({
      where: {
        ...PENDING_PARENT_WHERE,
        tenantId: tenant.id,
        createdAt: { lt: CUTOFF },
        emailVerified: { not: null },
        passwordHash: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        guardianProfile: {
          select: { family: { select: { name: true } } },
        },
      },
    });

    const classified = rows.map((r) => {
      const familyName = r.guardianProfile?.family?.name ?? null;
      const origin: Origin =
        !r.guardianProfile || familyName?.startsWith("Famille ")
          ? "public-form"
          : "school-created";
      return { ...r, origin };
    });
    const toReset = classified.filter((r) => r.origin === "public-form");
    const left = classified.length - toReset.length;

    console.log(
      `\n[${tenant.slug}] ${classified.length} pending account(s) created before ${CUTOFF.toISOString().slice(0, 10)} with a verification date: ` +
        `${toReset.length} from the public form (to reset), ${left} created by the school (left as is).`,
    );
    // Never a silent cut: a demo tenant can hold hundreds of seeded rows.
    const SHOWN = 30;
    for (const r of classified.slice(0, SHOWN)) {
      console.log(
        `  ${r.origin === "public-form" ? "RESET" : "keep "}  ${r.createdAt.toISOString().slice(0, 10)}  ${mask(r.email)}`,
      );
    }
    if (classified.length > SHOWN) {
      console.log(`  … ${classified.length - SHOWN} more not listed.`);
    }

    if (CONFIRM && toReset.length > 0) {
      const res = await prisma.user.updateMany({
        // Re-state the guard in the write itself.
        where: {
          id: { in: toReset.map((r) => r.id) },
          tenantId: tenant.id,
          emailVerified: { not: null },
          createdAt: { lt: CUTOFF },
        },
        data: { emailVerified: null },
      });
      console.log(`  → ${res.count} account(s) reset to "e-mail non vérifié".`);
    }
  }

  if (!CONFIRM) {
    console.log(
      "\nNothing written. Re-run with --tenant <slug> --confirm to apply.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

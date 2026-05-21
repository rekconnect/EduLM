/**
 * One-shot cleanup for the test data left over from Raed el Kady and
 * Romy Salameh's PARENT accounts. Removes their applications, owned
 * students, guardian rows, and any family that ends up orphan.
 *
 * Run with:  npx tsx prisma/cleanup-raed-romy.ts
 *
 * Safety notes:
 *  - Only touches users with role=PARENT whose name matches. The admin
 *    Raed account (if it has a different role) is untouched.
 *  - Prints a dry-run summary FIRST. Re-run with `--confirm` to actually
 *    delete. This way you see what's about to vanish before it does.
 *  - Wraps the deletes in a single $transaction — all-or-nothing.
 *
 * Adjust the NAME_PATTERNS array if the matching is off.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAME_PATTERNS = [
  // (firstName, lastName) — case-insensitive contains match
  { first: "Raed", last: "Kady" },
  { first: "Romy", last: "Salameh" },
];

const isConfirm = process.argv.includes("--confirm");

async function main() {
  console.log(
    isConfirm
      ? "🔴 RUNNING IN CONFIRM MODE — deletes will be committed."
      : "🟡 Dry run — no deletes. Re-run with --confirm to apply.\n",
  );

  // Find PARENT users matching either name pattern. Match firstName or
  // lastName (split) OR legacy `name` field.
  const orClauses = NAME_PATTERNS.flatMap((p) => [
    {
      AND: [
        { firstName: { contains: p.first, mode: "insensitive" as const } },
        { lastName: { contains: p.last, mode: "insensitive" as const } },
      ],
    },
    {
      name: {
        contains: `${p.first} ${p.last}`,
        mode: "insensitive" as const,
      },
    },
  ]);

  const parents = await prisma.user.findMany({
    where: {
      role: "PARENT",
      OR: orClauses,
    },
    include: {
      guardianProfile: {
        include: {
          childLinks: {
            include: {
              student: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          family: { select: { id: true, code: true } },
        },
      },
      submittedApps: { select: { id: true, childFirstName: true, childLastName: true, status: true } },
    },
  });

  if (parents.length === 0) {
    console.log("No matching PARENT users found. Nothing to do.");
    return;
  }

  // Collect IDs to delete.
  const userIds = new Set<string>();
  const guardianIds = new Set<string>();
  const familyIds = new Set<string>();
  const studentIds = new Set<string>();
  const applicationIds = new Set<string>();

  for (const p of parents) {
    userIds.add(p.id);
    if (p.guardianProfile) {
      guardianIds.add(p.guardianProfile.id);
      if (p.guardianProfile.family?.id) {
        familyIds.add(p.guardianProfile.family.id);
      }
      for (const link of p.guardianProfile.childLinks) {
        studentIds.add(link.studentId);
      }
    }
    for (const app of p.submittedApps) {
      applicationIds.add(app.id);
    }
  }

  // Summary.
  console.log(`Will delete from ${parents.length} parent user(s):`);
  for (const p of parents) {
    console.log(
      `  • ${p.lastName ?? ""} ${p.firstName ?? ""} (${p.name ?? "—"})  <${p.email}>`,
    );
    if (p.guardianProfile?.family?.code) {
      console.log(`      Family ${p.guardianProfile.family.code}`);
    }
    for (const link of p.guardianProfile?.childLinks ?? []) {
      console.log(
        `      Student: ${link.student.lastName} ${link.student.firstName} (${link.studentId})`,
      );
    }
    for (const app of p.submittedApps) {
      console.log(
        `      Application: ${app.childLastName} ${app.childFirstName} [${app.status}] (${app.id})`,
      );
    }
  }

  console.log(`\nTotal: ${userIds.size} user(s), ${guardianIds.size} guardian(s), ${studentIds.size} student(s), ${applicationIds.size} application(s), ${familyIds.size} family(ies)`);

  if (!isConfirm) {
    console.log("\nDry run complete. Re-run with `--confirm` to apply.");
    return;
  }

  // Order matters because some tables only cascade one direction.
  // ApplicationAnswer + ApplicationDocument cascade from Application → fine.
  // Enrollment cascades from Student → fine when we delete students.
  // StudentGuardian cascades from either side.
  // Family.SetNull from Guardian + Student — we delete the family separately.
  await prisma.$transaction(async (tx) => {
    if (applicationIds.size > 0) {
      const r = await tx.application.deleteMany({ where: { id: { in: [...applicationIds] } } });
      console.log(`  ↳ applications: ${r.count}`);
    }
    if (studentIds.size > 0) {
      const r = await tx.student.deleteMany({ where: { id: { in: [...studentIds] } } });
      console.log(`  ↳ students: ${r.count}`);
    }
    if (guardianIds.size > 0) {
      const r = await tx.guardian.deleteMany({ where: { id: { in: [...guardianIds] } } });
      console.log(`  ↳ guardians: ${r.count}`);
    }
    if (userIds.size > 0) {
      const r = await tx.user.deleteMany({ where: { id: { in: [...userIds] } } });
      console.log(`  ↳ parent users: ${r.count}`);
    }
    // Families: only delete if they're now orphaned (no remaining guardians
    // or students). Safer than blindly deleting — a shared family across
    // multiple parents would otherwise be wiped.
    for (const fid of familyIds) {
      const remaining = await tx.family.findUnique({
        where: { id: fid },
        select: {
          _count: { select: { guardians: true, students: true } },
        },
      });
      if (
        remaining &&
        remaining._count.guardians === 0 &&
        remaining._count.students === 0
      ) {
        await tx.family.delete({ where: { id: fid } });
        console.log(`  ↳ family ${fid} deleted (orphan)`);
      } else {
        console.log(
          `  ↳ family ${fid} kept (still has ${remaining?._count.guardians ?? 0} guardian(s), ${remaining?._count.students ?? 0} student(s))`,
        );
      }
    }
  });

  console.log("\n✓ Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

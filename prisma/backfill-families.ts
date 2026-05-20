/**
 * One-time backfill: assign Families to existing Guardians + Students.
 *
 * Run with:  npx tsx prisma/backfill-families.ts
 *
 * Rules:
 *  - Two guardians who share at least one student belong to the SAME family.
 *  - Each connected component (union-find over shared children) becomes one
 *    Family row.
 *  - Solo guardians (no children yet, or children with no other guardians)
 *    get their own Family.
 *  - Codes are generated tenant by tenant using the configured prefix/padding.
 *
 * Safe to re-run: skips guardians/students that already have a familyId.
 */

import { PrismaClient } from "@prisma/client";
import { formatFamilyCode } from "../src/lib/family";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Processing ${tenants.length} tenant(s)…\n`);

  for (const tenant of tenants) {
    console.log(`── ${tenant.name} (${tenant.id}) ──`);

    const guardians = await prisma.guardian.findMany({
      where: { tenantId: tenant.id, familyId: null },
      select: {
        id: true,
        userId: true,
        childLinks: { select: { studentId: true } },
      },
    });

    if (guardians.length === 0) {
      console.log(`  no unassigned guardians, skipping\n`);
      continue;
    }

    // Union-find over guardians by shared students.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let p = parent.get(x) ?? x;
      while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
      parent.set(x, p);
      return p;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    for (const g of guardians) parent.set(g.id, g.id);

    // Group guardians by shared student.
    const studentToGuardians = new Map<string, string[]>();
    for (const g of guardians) {
      for (const link of g.childLinks) {
        const list = studentToGuardians.get(link.studentId) ?? [];
        list.push(g.id);
        studentToGuardians.set(link.studentId, list);
      }
    }
    for (const list of studentToGuardians.values()) {
      for (let i = 1; i < list.length; i++) union(list[0]!, list[i]!);
    }

    // Bucket guardians by root.
    const buckets = new Map<string, { guardians: string[]; students: Set<string> }>();
    for (const g of guardians) {
      const root = find(g.id);
      const bucket = buckets.get(root) ?? { guardians: [], students: new Set() };
      bucket.guardians.push(g.id);
      for (const link of g.childLinks) bucket.students.add(link.studentId);
      buckets.set(root, bucket);
    }

    console.log(`  ${guardians.length} guardian(s) → ${buckets.size} family(ies)`);

    // Reserve a block of sequence numbers in one atomic update — avoids N
    // round-trips for N families. Counter is already per-tenant.
    const t = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { familyCodeNextSequence: { increment: buckets.size } },
      select: {
        familyCodePrefix: true,
        familyCodePadding: true,
        familyCodeNextSequence: true,
      },
    });
    const firstSeq = t.familyCodeNextSequence - buckets.size;

    let i = 0;
    for (const bucket of buckets.values()) {
      const code = formatFamilyCode(t.familyCodePrefix, t.familyCodePadding, firstSeq + i);
      i++;
      await prisma.$transaction(async (tx) => {
        const family = await tx.family.create({
          data: { tenantId: tenant.id, code },
          select: { id: true, code: true },
        });
        await tx.guardian.updateMany({
          where: { id: { in: bucket.guardians } },
          data: { familyId: family.id },
        });
        if (bucket.students.size > 0) {
          await tx.student.updateMany({
            where: { id: { in: Array.from(bucket.students) } },
            data: { familyId: family.id },
          });
        }
        console.log(`    ${family.code} — ${bucket.guardians.length} guardian(s), ${bucket.students.size} student(s)`);
      });
    }

    // Catch students that had NO guardian link in the above (orphan students).
    const orphans = await prisma.student.findMany({
      where: { tenantId: tenant.id, familyId: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (orphans.length > 0) {
      console.log(`  ${orphans.length} orphan student(s) (no guardian) — each gets its own family`);
      const t2 = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { familyCodeNextSequence: { increment: orphans.length } },
        select: {
          familyCodePrefix: true,
          familyCodePadding: true,
          familyCodeNextSequence: true,
        },
      });
      const firstOrphanSeq = t2.familyCodeNextSequence - orphans.length;
      for (let j = 0; j < orphans.length; j++) {
        const code = formatFamilyCode(t2.familyCodePrefix, t2.familyCodePadding, firstOrphanSeq + j);
        const family = await prisma.family.create({
          data: { tenantId: tenant.id, code },
          select: { id: true },
        });
        await prisma.student.update({
          where: { id: orphans[j]!.id },
          data: { familyId: family.id },
        });
        console.log(`    ${code} — ${orphans[j]!.lastName} ${orphans[j]!.firstName} (orphan)`);
      }
    }

    console.log("");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

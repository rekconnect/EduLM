/**
 * Read-only: verify the authorized-persons feature end-to-end — how many active
 * students will show persons on their fiche (via a guardian anchor), and a
 * sample student's resolved list (mirrors the student page's anchor logic).
 */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
type P = { relation: string; name: string; phone: string; emergency: boolean };
const parse = (ca: unknown): P[] => {
  if (!ca || typeof ca !== "object") return [];
  const raw = (ca as Record<string, unknown>).authorized_persons;
  if (typeof raw !== "string") return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? (a as P[]).filter((p) => p?.name) : [];
  } catch {
    return [];
  }
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { isActive: true } } },
    },
    select: {
      firstName: true,
      lastName: true,
      guardianLinks: {
        select: {
          isPrimary: true,
          guardian: {
            select: { relation: true, user: { select: { customAnswers: true } } },
          },
        },
      },
    },
  });

  const anchorList = (s: (typeof students)[number]): P[] => {
    const a =
      s.guardianLinks.find((l) => parse(l.guardian.user.customAnswers).length > 0) ??
      s.guardianLinks.find((l) => l.guardian.relation === "pere") ??
      s.guardianLinks.find((l) => l.isPrimary) ??
      s.guardianLinks[0];
    return a ? parse(a.guardian.user.customAnswers) : [];
  };

  let withPersons = 0;
  const samples: Array<{ name: string; people: P[] }> = [];
  for (const s of students) {
    const people = anchorList(s);
    if (people.length > 0) {
      withPersons++;
      if (samples.length < 5) samples.push({ name: `${s.lastName} ${s.firstName}`, people });
    }
  }
  console.log(`Active students: ${students.length}`);
  console.log(`  will SHOW authorized persons on their fiche: ${withPersons}`);
  for (const s of samples) {
    console.log(`\n  ${s.name}:`);
    for (const p of s.people)
      console.log(`     ${p.emergency ? "[urgence] " : ""}${p.name} — ${p.relation || "?"}${p.phone ? " · " + p.phone : ""}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * Read-only DRY-RUN validator for the accounting Cantine / Collation lists.
 * Reports match rate + unmatched rows, which EduLM students currently show the
 * service from billing but are NOT on the list, and Oliver Abboud as a sanity
 * check. Writes NOTHING — use sync-services-from-excel.ts to apply.
 *   npx tsx scripts/dars-import/check-services-excel.ts --tenant-name="..." \
 *     --collation="...xlsx" --cantine="...xlsx"
 */
import { PrismaClient } from "@prisma/client";
import {
  readServiceList,
  prepare,
  matchList,
  type MatchStudent,
} from "./lib/match-services.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const collationPath = arg("collation");
  const cantinePath = arg("cantine");

  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      enrollments: { some: { academicYear: { isActive: true } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      customAnswers: true,
      enrollments: {
        where: { academicYear: { isActive: true } },
        select: { class: { select: { name: true, level: true } } },
        take: 1,
      },
      guardianLinks: {
        select: { guardian: { select: { relation: true, user: { select: { name: true } } } } },
      },
    },
  });
  console.log(`EduLM active-year students: ${students.length}`);

  const matchStudents: MatchStudent[] = students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    className: s.enrollments[0]?.class.name ?? "",
    level: s.enrollments[0]?.class.level ?? "",
    fatherName:
      s.guardianLinks.find((l) => l.guardian.relation === "pere")?.guardian.user.name ?? "",
  }));
  const prepared = prepare(matchStudents);

  const billingHasCollation = (s: (typeof students)[number]) => {
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    try {
      const m = JSON.parse(String(ca.services_by_year ?? "{}")) as Record<string, string>;
      return (m["2025-2026"] ?? "").includes("Collation");
    } catch {
      return false;
    }
  };

  async function analyze(label: string, path: string): Promise<Set<string>> {
    if (!path) {
      console.log(`\n=== ${label}: no file given ===`);
      return new Set();
    }
    const rows = await readServiceList(path);
    const { onList, unmatched } = matchList(prepared, rows);
    console.log(`\n=== ${label}: ${rows.length} rows, matched ${onList.size}, UNMATCHED ${unmatched.length} ===`);
    for (const u of unmatched.slice(0, 40))
      console.log(`   ✗ [${u.why}] ${u.nom} ${u.prenom} (père ${u.pere}, ${u.classe})`);
    if (unmatched.length > 40) console.log(`   … +${unmatched.length - 40} more`);
    return onList;
  }

  const onCollation = await analyze("COLLATION", collationPath);
  await analyze("CANTINE", cantinePath);

  if (collationPath) {
    const flipToNon = students.filter(
      (s) => billingHasCollation(s) && !onCollation.has(s.id),
    );
    console.log(
      `\nCollation: EduLM currently 'Oui' from billing but NOT on the new list → would become Non: ${flipToNon.length}`,
    );
    for (const s of flipToNon.slice(0, 25))
      console.log(`   - ${s.lastName} ${s.firstName} (${s.enrollments[0]?.class.name ?? "?"})`);
    if (flipToNon.length > 25) console.log(`   … +${flipToNon.length - 25} more`);

    const oliver = students.find(
      (s) => /abboud/i.test(s.lastName) && /oliver/i.test(s.firstName),
    );
    if (oliver)
      console.log(
        `\nSanity — Oliver Abboud: on new collation list? ${onCollation.has(oliver.id) ? "OUI" : "NON"} (billing currently ${billingHasCollation(oliver) ? "Oui" : "Non"})`,
      );
  }

  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

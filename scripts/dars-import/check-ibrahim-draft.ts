/** Read-only: existing renewal draft for Ibrahim + the submitting parent's
 *  family link (foyer reads from THAT family, not the student's). */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const st = await prisma.student.findFirst({
    where: { tenantId: tenant.id, lastName: { contains: "ibrahim", mode: "insensitive" }, firstName: { contains: "george", mode: "insensitive" } },
    select: { id: true },
  });
  if (!st) { console.log("no student"); return; }

  const apps = await prisma.application.findMany({
    where: { existingStudentId: st.id },
    select: {
      id: true, status: true, createdAt: true,
      childGender: true, childBirthCountry: true, childPlaceOfBirth: true,
      childNationality: true, childNationality2: true, childIsLebanese: true,
      childFirstNameAr: true, childLastNameAr: true, submitterRelation: true,
      submittedByUserId: true,
      dossierAnswers: true,
      responsables: { select: { kind: true, firstName: true, lastName: true } },
      siblings: { select: { firstName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Renewal apps for Ibrahim: ${apps.length}`);
  for (const a of apps) {
    console.log(`\n  app ${a.id} [${a.status}] created ${a.createdAt.toISOString().slice(0, 16)}`);
    console.log(`    gender=${a.childGender} birthCountry=${a.childBirthCountry} placeOfBirth=${a.childPlaceOfBirth}`);
    console.log(`    nat=${a.childNationality}/${a.childNationality2} isLebanese=${a.childIsLebanese} ar=${a.childFirstNameAr}/${a.childLastNameAr} rel=${a.submitterRelation}`);
    console.log(`    responsables=${a.responsables.length} siblings=${a.siblings.length}`);
    console.log(`    submittedBy=${a.submittedByUserId}`);
    const d = (a.dossierAnswers ?? {}) as Record<string, unknown>;
    console.log(`    dossierAnswers keys=${Object.keys(d).join(",")}`);

    // The submitting parent's family (what foyer reads).
    const g = await prisma.guardian.findUnique({
      where: { userId: a.submittedByUserId },
      select: { relation: true, family: { select: { code: true, addressStreet: true, addressHood: true, addressCity: true } } },
    });
    console.log(`    submitter guardian relation=${g?.relation} family=${JSON.stringify(g?.family)}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

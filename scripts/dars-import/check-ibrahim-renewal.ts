/** Read-only: what prefill data exists for IBRAHIM GEORGE JOSEPH — Student
 *  columns + customAnswers, Family, and the linked parents' User.customAnswers. */
import { PrismaClient } from "@prisma/client";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const students = await prisma.student.findMany({
    where: {
      tenantId: tenant.id,
      lastName: { contains: "ibrahim", mode: "insensitive" },
      firstName: { contains: "george", mode: "insensitive" },
    },
    select: {
      id: true, firstName: true, lastName: true, gender: true,
      nationality: true, placeOfBirth: true, address: true, city: true,
      postalCode: true, country: true, customAnswers: true, familyId: true,
      family: {
        select: {
          code: true, addressStreet: true, addressHood: true, addressCity: true,
          imageRightsSite: true, imageRightsBook: true, imageRightsSocial: true, imageRightsRadio: true,
          students: { select: { firstName: true, lastName: true, status: true } },
        },
      },
      guardianLinks: {
        select: {
          isPrimary: true,
          guardian: {
            select: {
              relation: true,
              user: { select: { firstName: true, lastName: true, name: true, email: true, customAnswers: true } },
            },
          },
        },
      },
    },
  });

  for (const s of students) {
    console.log(`\n=== ${s.lastName} ${s.firstName} (${s.id}) ===`);
    console.log("Student cols:", JSON.stringify({
      gender: s.gender, nationality: s.nationality, placeOfBirth: s.placeOfBirth,
      address: s.address, city: s.city, country: s.country,
    }));
    const ca = (s.customAnswers ?? {}) as Record<string, unknown>;
    const idKeys = ["lieu_naissance", "pays_naissance", "nationalite", "nationalite2",
      "nom_prenom_ar", "lieu_naissance_ar", "communaute_eleve", "numero_identite",
      "registration_by_year", "services_by_year"];
    console.log("customAnswers (identity/transport keys):");
    for (const k of idKeys) if (ca[k] != null) console.log(`   ${k} = ${JSON.stringify(ca[k]).slice(0, 160)}`);
    console.log("ALL customAnswers keys:", Object.keys(ca).join(", "));

    console.log("Family:", JSON.stringify({
      code: s.family?.code, street: s.family?.addressStreet,
      hood: s.family?.addressHood, city: s.family?.addressCity,
      img: [s.family?.imageRightsSite, s.family?.imageRightsBook, s.family?.imageRightsSocial, s.family?.imageRightsRadio],
    }));
    console.log("Siblings in family:", s.family?.students.map((x) => `${x.lastName} ${x.firstName} [${x.status}]`).join(" · "));

    console.log("Guardians:");
    for (const g of s.guardianLinks) {
      const pca = (g.guardian.user.customAnswers ?? {}) as Record<string, unknown>;
      console.log(`   relation=${g.guardian.relation} primary=${g.isPrimary} — ${g.guardian.user.name ?? `${g.guardian.user.firstName ?? ""} ${g.guardian.user.lastName ?? ""}`} <${g.guardian.user.email}>`);
      console.log(`      parent customAnswers keys: ${Object.keys(pca).join(", ")}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

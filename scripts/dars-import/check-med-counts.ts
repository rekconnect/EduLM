/** Read-only: row counts of the new medical tables (import progress / verify). */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const [records, imms, visits] = await Promise.all([
    prisma.studentMedicalRecord.count(),
    prisma.studentImmunization.count(),
    prisma.medicalVisit.count(),
  ]);
  console.log(`records=${records} immunizations=${imms} visits=${visits}`);
  const sample = await prisma.studentMedicalRecord.findFirst({
    where: { allergies: { not: null } },
    select: {
      allergies: true,
      asthma: true,
      bloodType: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });
  if (sample)
    console.log(
      `sample: ${sample.student.firstName} ${sample.student.lastName} — allergies="${sample.allergies}" asthme=${sample.asthma} sang=${sample.bloodType ?? "—"}`,
    );
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

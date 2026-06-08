/**
 * Read-only: for a few students, show where their per-year AUTH lives in the
 * Dars BACKUP — Isc_ModifStudents (finalized) vs Isc_TmpStudent (in-progress) —
 * and its value, per SYear. Explains why current-year auth is right for some
 * students (Matteo, Jamati) and missing for others (Gwen).
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const NAMES = [
  ["Gwen", "Abbosh"],
  ["Matteo", "Kassis"],
  ["", "Jamati"],
];
const A = (r: Record<string, unknown>) =>
  `site=${r.AllowPublishImages ?? "null"} livre=${r.AllowPublishToSouvenirBook ?? "null"} reseaux=${r.AllowPublishToSocialMedia ?? "null"} radio=${r.AllowPublishAudio ?? "null"}`;

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  for (const [first, last] of NAMES) {
    const st = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        ...(first ? { firstName: { contains: first, mode: "insensitive" } } : {}),
        lastName: { contains: last, mode: "insensitive" },
        darsStudentId: { not: null },
      },
      select: { firstName: true, lastName: true, darsStudentId: true, status: true },
    });
    if (!st) {
      console.log(`\n=== ${first} ${last} — not found / no darsStudentId ===`);
      continue;
    }
    const sid = Number(st.darsStudentId);
    console.log(
      `\n=== ${st.firstName} ${st.lastName} (status ${st.status}, Dars ID ${sid}) ===`,
    );

    const mod = await darsQuery<Record<string, unknown>>(
      `SELECT SYear, AllowPublishImages, AllowPublishToSouvenirBook, AllowPublishToSocialMedia, AllowPublishAudio
       FROM Isc_ModifStudents WHERE Id_College=${C} AND Id_Student=${sid} ORDER BY SYear DESC`,
    );
    const tmp = await darsQuery<Record<string, unknown>>(
      `SELECT SYear, AllowPublishImages, AllowPublishToSouvenirBook, AllowPublishToSocialMedia, AllowPublishAudio
       FROM Isc_TmpStudent WHERE Id_College=${C} AND ID_Student=${sid} ORDER BY SYear DESC`,
    );

    console.log("  Isc_ModifStudents (finalized):");
    if (mod.length === 0) console.log("    (none)");
    for (const r of mod) console.log(`    SYear ${r.SYear}: ${A(r)}`);
    console.log("  Isc_TmpStudent (in-progress draft):");
    if (tmp.length === 0) console.log("    (none)");
    for (const r of tmp) console.log(`    SYear ${r.SYear}: ${A(r)}`);
  }

  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

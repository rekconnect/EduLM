/**
 * Backfill the two coverage gaps on current data:
 *   1. Student Nationalité 2 (customAnswers.nationalite2) from Isc_Student.Id_Nation2
 *   2. Family-level photo authorizations (Family.imageRights*) aggregated from
 *      the family's kids' Isc_ModifStudents permissions.
 *
 * DRY RUN by default; --confirm to apply.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { CodesTable } from "./lib/codes.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const inList = (a: number[]) => (a.length ? a.join(",") : "-1");

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const T = tenant.id;
  const codes = await CodesTable.load();

  // ── 1. Student Nationalité 2 ──
  const students = await prisma.student.findMany({
    where: { tenantId: T, darsStudentId: { not: null } },
    select: { id: true, darsStudentId: true, customAnswers: true },
  });
  const sIds = students.map((s) => Number(s.darsStudentId));
  const dStu = await darsQuery<{ ID_Student: number; Id_Nation2: number | null }>(
    `SELECT ID_Student, Id_Nation2 FROM Isc_Student WHERE Id_College=${C} AND ID_Student IN (${inList(sIds)})`,
  );
  const nat2 = new Map<number, string>();
  for (const r of dStu) {
    const lbl = codes.label(r.Id_Nation2 as number);
    if (lbl) nat2.set(Number(r.ID_Student), lbl);
  }

  // ── 2. Family photo authorizations from kids' Isc_ModifStudents ──
  const families = await prisma.family.findMany({
    where: { tenantId: T, darsRootParentId: { not: null } },
    select: { id: true, students: { select: { darsStudentId: true } } },
  });
  const allKidIds = families.flatMap((f) => f.students.map((s) => Number(s.darsStudentId)).filter(Boolean));
  const mod = await darsQuery<Record<string, unknown>>(
    `SELECT ms.Id_Student, ms.AllowPublishImages, ms.AllowPublishToSouvenirBook,
            ms.AllowPublishToSocialMedia, ms.AllowPublishAudio
     FROM Isc_ModifStudents ms
     JOIN (SELECT Id_Student, MAX(SYear) AS mx FROM Isc_ModifStudents WHERE Id_College=${C} GROUP BY Id_Student) m
       ON m.Id_Student = ms.Id_Student AND m.mx = ms.SYear
     WHERE ms.Id_College=${C} AND ms.Id_Student IN (${inList(allKidIds)})`,
  );
  const modByStu = new Map(mod.map((r) => [Number(r.Id_Student), r]));

  // aggregate per family: any kid true → true; else if any kid has a row → false; else null
  const agg = (kids: number[], col: string): boolean | null => {
    let anyRow = false;
    for (const k of kids) {
      const r = modByStu.get(k);
      if (!r) continue;
      anyRow = true;
      if (r[col]) return true;
    }
    return anyRow ? false : null;
  };
  const famPhotos = new Map<string, { site: boolean | null; book: boolean | null; social: boolean | null; radio: boolean | null }>();
  for (const f of families) {
    const kids = f.students.map((s) => Number(s.darsStudentId)).filter(Boolean);
    const v = {
      site: agg(kids, "AllowPublishImages"),
      book: agg(kids, "AllowPublishToSouvenirBook"),
      social: agg(kids, "AllowPublishToSocialMedia"),
      radio: agg(kids, "AllowPublishAudio"),
    };
    if (v.site != null || v.book != null || v.social != null || v.radio != null) famPhotos.set(f.id, v);
  }

  console.log(`Students getting Nationalité 2: ${nat2.size}`);
  console.log(`Families getting photo authorizations: ${famPhotos.size}`);

  if (!confirm) {
    console.log("🟡 DRY RUN — re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  // apply student nat2
  let d1 = 0;
  for (let i = 0; i < students.length; i += 10) {
    await Promise.all(
      students.slice(i, i + 10).map((s) => {
        const lbl = nat2.get(Number(s.darsStudentId));
        if (!lbl) return Promise.resolve();
        const ca = { ...((s.customAnswers ?? {}) as Record<string, unknown>), nationalite2: lbl };
        return prisma.student.update({ where: { id: s.id }, data: { customAnswers: ca } });
      }),
    );
    d1 += Math.min(10, students.length - i);
    process.stdout.write(`\r  student nat2: ${d1}/${students.length}`);
  }
  process.stdout.write("\n");

  // apply family photos
  const fEntries = [...famPhotos.entries()];
  let d2 = 0;
  for (let i = 0; i < fEntries.length; i += 10) {
    await Promise.all(
      fEntries.slice(i, i + 10).map(([id, v]) =>
        prisma.family.update({
          where: { id },
          data: {
            imageRightsSite: v.site, imageRightsBook: v.book,
            imageRightsSocial: v.social, imageRightsRadio: v.radio,
          },
        }),
      ),
    );
    d2 += Math.min(10, fEntries.length - i);
    process.stdout.write(`\r  family photos: ${d2}/${fEntries.length}`);
  }
  process.stdout.write("\n✓ Gaps backfilled.\n");
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await prisma.$disconnect(); process.exit(1); });

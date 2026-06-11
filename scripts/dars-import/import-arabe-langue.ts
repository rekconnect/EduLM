/**
 * Targeted backfill: import the Arabic track (ALE/ALM on Isc_TmpStudent) into
 * registration_by_year[<year>].arabe_langue, WITHOUT re-running the full enrich
 * (which would rebuild services_by_year and clobber the accounting-list sync).
 * ALM is the implicit default (always 0), so ALE checked → "Étrangère", else
 * "Maternelle". Only the per-year arabe_langue key is touched; everything else
 * in registration_by_year is preserved.
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-arabe-langue.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const yearLabel = (sy: number) => `${sy - 1}-${sy}`; // 2026 → "2025-2026"

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT ID_Student, SYear, ALE, ALM FROM Isc_TmpStudent WHERE Id_College=${C}`,
  );
  // darsStudentId → { yearLabel → "Maternelle" | "Étrangère" }
  const byStudent = new Map<number, Map<string, string>>();
  for (const r of rows) {
    const sid = Number(r.ID_Student);
    const sy = Number(r.SYear);
    if (!Number.isFinite(sid) || !Number.isFinite(sy)) continue;
    const val = r.ALE ? "Étrangère" : "Maternelle";
    let m = byStudent.get(sid);
    if (!m) {
      m = new Map();
      byStudent.set(sid, m);
    }
    m.set(yearLabel(sy), val);
  }
  console.log(`Isc_TmpStudent rows: ${rows.length} · students with ALE/ALM: ${byStudent.size}`);

  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id, darsStudentId: { in: [...byStudent.keys()] } },
    select: { id: true, darsStudentId: true, firstName: true, lastName: true, customAnswers: true },
  });

  const updates: Array<{ id: string; ca: Record<string, unknown>; label: string }> = [];
  let etr = 0;
  let mat = 0;
  for (const s of students) {
    const perYear = byStudent.get(Number(s.darsStudentId));
    if (!perYear) continue;
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    let reg: Record<string, Record<string, string>> = {};
    if (typeof ca.registration_by_year === "string") {
      try {
        reg = JSON.parse(ca.registration_by_year) as Record<string, Record<string, string>>;
      } catch {
        reg = {};
      }
    }
    let changed = false;
    for (const [label, val] of perYear) {
      const cur = { ...(reg[label] ?? {}) };
      if (cur.arabe_langue !== val) {
        cur.arabe_langue = val;
        reg[label] = cur;
        changed = true;
        if (val === "Étrangère") etr++;
        else mat++;
      }
    }
    if (changed) {
      ca.registration_by_year = JSON.stringify(reg);
      updates.push({
        id: s.id,
        ca,
        label: `${s.lastName} ${s.firstName}: ${[...perYear.entries()].map(([y, v]) => `${y}=${v}`).join(", ")}`,
      });
    }
  }

  console.log(`\nStudents to update: ${updates.length}  (Étrangère set: ${etr}, Maternelle set: ${mat})`);
  for (const u of updates.filter((u) => u.label.includes("Étrangère")).slice(0, 12))
    console.log(`   • ${u.label}`);

  if (!CONFIRM) {
    console.log(`\nDry-run. Re-run with --confirm to write ${updates.length} students.`);
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  console.log(`\nWriting ${updates.length} students…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.student.update({
              where: { id: u.id },
              data: { customAnswers: u.ca as Prisma.InputJsonValue },
            }),
          ),
        );
        done += chunk.length;
        break;
      } catch (e) {
        if (attempt === 6) throw e;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
  console.log(`✓ Set arabe_langue for ${done} students.`);
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

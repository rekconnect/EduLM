/**
 * Import "personnes autorisées à récupérer l'élève" + emergency contacts from
 * Dars into EduLM. Source:
 *   - Isc_ModifRelations  (Id_Parent, Relationship, FullName, PhoneNumber)
 *   - Isc_TmpParent       (Emergency_FullName1/2, MobileNumber1/2, Relationship1/2)
 * Both are keyed by the Dars parent id → matches User.darsParentId. The merged
 * list is stored as JSON on User.customAnswers.authorized_persons:
 *   [{ relation, name, phone, emergency: boolean }]
 * and surfaced on the student fiche (aggregated from the child's guardians).
 *
 * DRY-RUN by default; --confirm to write.
 *   npx tsx scripts/dars-import/import-authorized-persons.ts --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes("--confirm");
const clean = (v: unknown) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

type Person = { relation: string; name: string; phone: string; emergency: boolean };

async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);

  const rels = await darsQuery<Record<string, unknown>>(
    `SELECT Id_Parent, Relationship, FullName, PhoneNumber
     FROM Isc_ModifRelations WHERE Id_College=${C}`,
  );
  const emg = await darsQuery<Record<string, unknown>>(
    `SELECT ID_Parent, Emergency_FullName1, Emergency_MobileNumber1, Emergency_Relationship1,
            Emergency_FullName2, Emergency_MobileNumber2, Emergency_Relationship2
     FROM Isc_TmpParent WHERE Id_College=${C}`,
  );
  console.log(`Dars: Isc_ModifRelations rows=${rels.length}, Isc_TmpParent rows=${emg.length}`);

  const byParent = new Map<number, Person[]>();
  const add = (pid: number, p: Person) => {
    if (!p.name) return;
    const a = byParent.get(pid) ?? [];
    // de-dup identical (name+phone+emergency)
    if (a.some((x) => x.name === p.name && x.phone === p.phone && x.emergency === p.emergency)) return;
    a.push(p);
    byParent.set(pid, a);
  };
  for (const r of rels)
    add(Number(r.Id_Parent), {
      relation: clean(r.Relationship),
      name: clean(r.FullName),
      phone: clean(r.PhoneNumber),
      emergency: false,
    });
  for (const r of emg) {
    const pid = Number(r.ID_Parent);
    if (clean(r.Emergency_FullName1))
      add(pid, {
        relation: clean(r.Emergency_Relationship1),
        name: clean(r.Emergency_FullName1),
        phone: clean(r.Emergency_MobileNumber1),
        emergency: true,
      });
    if (clean(r.Emergency_FullName2))
      add(pid, {
        relation: clean(r.Emergency_Relationship2),
        name: clean(r.Emergency_FullName2),
        phone: clean(r.Emergency_MobileNumber2),
        emergency: true,
      });
  }

  const parentIds = [...byParent.keys()];
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, darsParentId: { in: parentIds } },
    select: { id: true, darsParentId: true, customAnswers: true, name: true },
  });
  const userByDars = new Map(users.map((u) => [Number(u.darsParentId), u]));

  let matched = 0;
  let persons = 0;
  let unmatched = 0;
  const updates: Array<{ id: string; ca: Record<string, unknown>; name: string | null; n: number }> = [];
  for (const [pid, list] of byParent) {
    const u = userByDars.get(pid);
    if (!u) {
      unmatched++;
      continue;
    }
    matched++;
    persons += list.length;
    const ca: Record<string, unknown> =
      u.customAnswers && typeof u.customAnswers === "object"
        ? { ...(u.customAnswers as Record<string, unknown>) }
        : {};
    ca.authorized_persons = JSON.stringify(list);
    updates.push({ id: u.id, ca, name: u.name, n: list.length });
  }

  console.log(`\nParents with persons in Dars: ${byParent.size}`);
  console.log(`  matched to EduLM users: ${matched}   unmatched parents: ${unmatched}`);
  console.log(`  total persons to import: ${persons}`);
  for (const u of updates.slice(0, 12))
    console.log(`   • ${u.name ?? "?"}: ${u.n} personne(s)`);
  if (updates.length > 12) console.log(`   … +${updates.length - 12} more`);

  if (!CONFIRM) {
    console.log(`\nDry-run. Re-run with --confirm to write ${updates.length} users.`);
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  console.log(`\nWriting ${updates.length} users…`);
  let done = 0;
  for (let i = 0; i < updates.length; i += 5) {
    const chunk = updates.slice(i, i + 5);
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await Promise.all(
          chunk.map((u) =>
            prisma.user.update({
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
  console.log(`✓ Imported authorized persons for ${done} families.`);
  await closeDars();
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});

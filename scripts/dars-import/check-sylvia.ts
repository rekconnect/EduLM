import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
const p = new PrismaClient();

async function main() {
  const first = process.argv[2] ?? "Sylvia";
  const last = process.argv[3] ?? "Saade";
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });

  // ── EduLM side ──
  console.log("══════ EduLM ══════");
  const users = await p.user.findMany({
    where: {
      tenantId: t!.id, role: "PARENT",
      AND: [
        { firstName: { contains: first, mode: "insensitive" } },
        { lastName: { contains: last, mode: "insensitive" } },
      ],
    },
    select: {
      id: true, firstName: true, lastName: true, status: true, darsParentId: true,
      guardianProfile: {
        select: {
          relation: true,
          family: { select: { code: true, darsRootParentId: true } },
          childLinks: { select: { student: { select: { firstName: true, lastName: true, status: true } } } },
        },
      },
    },
  });
  for (const u of users) {
    console.log(`\n  User ${u.firstName} ${u.lastName} | status=${u.status} | dars=${u.darsParentId} | rel=${u.guardianProfile?.relation}`);
    console.log(`    family code: ${u.guardianProfile?.family?.code} (root ${u.guardianProfile?.family?.darsRootParentId})`);
    console.log(`    children: ${(u.guardianProfile?.childLinks ?? []).map((l) => `${l.student.firstName} ${l.student.lastName} [${l.student.status}]`).join(", ") || "none"}`);
  }

  // ── Dars side ──
  console.log("\n══════ Dars ══════");
  const dp = await darsQuery(
    `SELECT ID_Parent, ParentCode, FirstName, LastName, Id_MainParent, Actual
     FROM Isc_Parent WHERE Id_College=${C} AND FirstName LIKE '%${first}%' AND LastName LIKE '%${last}%'`,
  );
  console.log("Dars parent records:");
  console.table(dp);

  const ids = (dp as Array<{ ID_Parent: number }>).map((r) => Number(r.ID_Parent));
  if (ids.length) {
    const kids = await darsQuery(
      `SELECT ID_Student, FirstName, LastName, ID_Father, ID_Mother, ID_Gardian
       FROM Isc_Student WHERE Id_College=${C} AND (ID_Mother IN (${ids.join(",")}) OR ID_Father IN (${ids.join(",")}))`,
    );
    console.log("\nStudents where she is mother/father:");
    console.table(kids);
  }

  await closeDars();
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await p.$disconnect(); process.exit(1); });

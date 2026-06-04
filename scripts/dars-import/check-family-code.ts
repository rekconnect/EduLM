import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
const p = new PrismaClient();
async function main() {
  const code = process.argv[2] ?? "F-00409";
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const fam = await p.family.findFirst({
    where: { tenantId: t!.id, code },
    select: { code: true, name: true, darsRootParentId: true },
  });
  console.log("EduLM family:", JSON.stringify(fam));
  if (fam?.darsRootParentId) {
    const rows = await darsQuery(
      `SELECT ID_Parent, ParentCode, FirstName, LastName, Id_MainParent FROM Isc_Parent
       WHERE Id_College = ${C} AND ID_Parent = ${fam.darsRootParentId}`,
    );
    console.log("Dars root parent:", JSON.stringify(rows[0]));
  }
  await closeDars();
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await p.$disconnect(); process.exit(1); });

import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
const p = new PrismaClient();
async function main() {
  const code = process.argv[2] ?? "D0018";
  const t = await p.tenant.findFirst({ where: { name: { contains: "Montaigne" } }, select: { id: true } });
  const fam = await p.family.findFirst({
    where: { tenantId: t!.id, code },
    select: { code: true, darsRootParentId: true, addressStreet: true, addressHood: true, addressCity: true },
  });
  console.log("EduLM family:", JSON.stringify(fam));
  if (!fam?.darsRootParentId) { await closeDars(); await p.$disconnect(); return; }

  const par = await darsQuery<{ Id_Address: number }>(
    `SELECT Id_Address FROM Isc_Parent WHERE Id_College=${C} AND ID_Parent=${fam.darsRootParentId}`,
  );
  const addrId = Number(par[0]?.Id_Address);
  console.log("\nDars root parent Id_Address:", addrId);
  if (!addrId) { await closeDars(); await p.$disconnect(); return; }

  const a = (await darsQuery(
    `SELECT ID, Id_Qaza, Id_Town, Street, Building, AddressFloor, PlaceDetails, PoBox, AddressRemark,
            StreetAr, BuildingAr, PlaceDetailsAr
     FROM Isc_Address WHERE Id_College=${C} AND ID=${addrId}`,
  ))[0] as Record<string, unknown>;
  console.log("\nRaw Isc_Address row:");
  console.log(JSON.stringify(a, null, 1));

  const qaza = await darsQuery(`SELECT Qaza, QazaAR FROM Isc_Qaza WHERE Id_College=${C} AND ID=${Number(a.Id_Qaza)}`);
  const town = await darsQuery(`SELECT TownName, TownNameAr FROM Isc_Town WHERE Id_College=${C} AND Id_Town=${Number(a.Id_Town)}`);
  console.log("\nQaza lookup (Id_Qaza=" + a.Id_Qaza + "):", JSON.stringify(qaza[0]));
  console.log("Town lookup (Id_Town=" + a.Id_Town + "):", JSON.stringify(town[0]));

  await closeDars();
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await closeDars(); await p.$disconnect(); process.exit(1); });

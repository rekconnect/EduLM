import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
async function main() {
  const id = process.argv[2] ?? "13641";
  const r = await darsQuery(
    `SELECT ID_Parent, FirstName, LastName, FirstNameAr, LastNameAr, MiddleNameAr,
            RegisterNum, RegisterTown, RegisterTownAR, Id_RegisterQaza
     FROM Isc_Parent WHERE Id_College = ${C} AND ID_Parent = ${id}`,
  );
  console.log(JSON.stringify(r[0], null, 1));
  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });

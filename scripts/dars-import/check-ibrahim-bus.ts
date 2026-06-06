import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
async function main() {
  console.log("=== OLD Ibrahim 104/779 — ModifStudents (all years) ===");
  console.table(
    await darsQuery(
      `SELECT Id_Student, SYear, BusRegistered, Transportation_BusMorning, Transportation_BusEvening,
              AllowPublishImages, AllowPublishToSouvenirBook, AllowPublishToSocialMedia, AllowPublishAudio
       FROM Isc_ModifStudents WHERE Id_College=${C} AND Id_Student IN (104,779) ORDER BY Id_Student, SYear`,
    ),
  );
  console.log("=== Isc_StudentClass bus (104,779,2017,2018) any year ===");
  console.table(
    await darsQuery(
      `SELECT ID_Student, SYear, Id_BusReg, BusDetails, Id_BusRegTown
       FROM Isc_StudentClass WHERE Id_College=${C} AND ID_Student IN (104,779,2017,2018) ORDER BY ID_Student, SYear`,
    ),
  );
  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });

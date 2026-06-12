/** Read-only: confirm Trs_Eleve_Station.Id_Quartier → Isc_Town.Id_Town (+ Id_ZoneBus → Trs_Zone). */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const towns = await darsQuery<Record<string, unknown>>(
    `SELECT t.Id_Town, t.TownName, t.Id_ZoneBus, z.ligne AS ZoneNo, z.Description AS ZoneDesc
     FROM Isc_Town t LEFT JOIN Trs_Zone z ON z.ID = t.Id_ZoneBus
     WHERE t.Id_Town IN (54,341,611,1414)`,
  );
  console.table(towns);

  // Sanity: a few known students' quartiers via the join.
  const sample = await darsQuery<Record<string, unknown>>(
    `SELECT TOP 8 s.LastName, s.FirstName, es.Type_Trajet, t.TownName, z.ligne AS ZoneNo,
            CAST(c.Numero AS varchar(10)) AS BusNo
     FROM Trs_Eleve_Station es
     JOIN Isc_Student s ON s.ID_Student=es.Id_Eleve AND s.Id_College=${C}
     LEFT JOIN Isc_Town t ON t.Id_Town = es.Id_Quartier
     LEFT JOIN Trs_Zone z ON z.ID = t.Id_ZoneBus
     LEFT JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit
     WHERE es.Id_College=${C} AND es.Id_Session=2709 AND s.LastName IN ('KASSIS','FARHAT')
     ORDER BY s.LastName`,
  );
  console.table(sample);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

/** Read-only: resolve quartier + zone for the 4 v54-billed students missing in EduLM. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  const types = await darsQuery<{ Type: string; n: number }>(
    `SELECT Type, COUNT(*) AS n FROM Trs_Codes GROUP BY Type ORDER BY Type`,
  );
  console.log("Trs_Codes types:", types.map((t) => `${t.Type}(${t.n})`).join(", "));

  // The station rows of the 4 billed-but-unassigned students.
  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT s.LastName, s.FirstName, es.Type_Trajet, es.Station, es.Id_Quartier,
            CAST(c.Numero AS varchar(10)) AS BusNo, q.Libelle AS Quartier, q.Type AS QType, q.Code AS QCode
     FROM Trs_Eleve_Station es
     JOIN Fct_Eleve_Tarif f ON f.Id_Eleve_Station = es.ID AND f.Id_College=${C}
     JOIN Fct_Factures_Entete fe ON fe.ID=f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement=54
     JOIN Isc_Student s ON s.ID_Student = es.Id_Eleve AND s.Id_College=${C}
     LEFT JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit
     LEFT JOIN Trs_Codes q ON q.ID = es.Id_Quartier
     WHERE es.Id_College=${C} AND (
       (s.LastName LIKE '%ESTEPHAN%' AND s.FirstName LIKE '%LUCIANA%') OR
       (s.LastName LIKE '%Khoury%' AND s.FirstName LIKE '%AYLA%') OR
       (s.LastName LIKE '%Hatem%') OR
       (s.LastName LIKE '%Jabbour%' AND s.FirstName LIKE '%Michael%'))`,
  );
  console.table(rows);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

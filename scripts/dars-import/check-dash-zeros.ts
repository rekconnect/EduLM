/** Read-only: for students whose V54 net ≠ EduLM, show their billing across
 *  versements 49/52/54 (Perc, Montant, Net, désistement) to see WHY. */
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

const NAMES = [
  "HECHAIME", "ABOU EL NASR", "CHIDIAC", "ABOU AZAR", "MAWAS", "ATTIEH",
  "RIZK", "SOBEH", "MAALOUF", "Obeid", "Saade", "IBRAHIM", "SAYAH", "ACHKAR",
  "Elia Abou Jaoude",
];

async function main() {
  const like = NAMES.map((n) => `s.LastName LIKE '%${n.replace("'", "''")}%'`).join(" OR ");
  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT s.LastName, s.FirstName, fe.ID_Versement, f.Perc, f.Montant, f.Net,
            es.Type_Trajet, es.Flag_Desistement, CONVERT(varchar(10), es.Date_Desistement, 120) AS DateDesist,
            f.Flag_Desistement AS FctDesist
     FROM Fct_Eleve_Tarif f
     JOIN Fct_Factures_Entete fe ON fe.ID=f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement IN (49,52,54)
     JOIN Trs_Eleve_Station es ON es.ID=f.Id_Eleve_Station AND es.Id_College=${C}
     JOIN Isc_Student s ON s.ID_Student=f.Id_Eleve AND s.Id_College=${C}
     WHERE f.Id_College=${C} AND (${like})
     ORDER BY s.LastName, s.FirstName, fe.ID_Versement`,
  );
  console.table(rows);
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await closeDars();
  process.exit(1);
});

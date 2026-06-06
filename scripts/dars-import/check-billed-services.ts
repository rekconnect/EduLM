import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Fct_Tarif_Classe columns ===");
  const cols = await darsQuery<{ name: string }>(
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Fct_Tarif_Classe' ORDER BY ORDINAL_POSITION`,
  );
  console.log(cols.map((c) => c.name).join(", "));

  // Link student tariff lines → tariff type, for current year (Annee 2026 invoices)
  console.log("\n=== Current-year (2026) students billed per service ===");
  console.table(
    await darsQuery(
      `SELECT tt.Code, tt.label, COUNT(DISTINCT et.Id_Eleve) AS students
       FROM Fct_Eleve_Tarif et
       JOIN Fct_Tarif_Classe tc ON tc.ID = et.Id_Tarif_Classe
       JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif
       JOIN Fct_Factures_Entete fe ON fe.ID = et.ID_Entete
       WHERE et.Id_College=${C} AND fe.Annee=2026 AND tt.Code IN ('TRANS','CAN','COL')
       GROUP BY tt.Code, tt.label`,
    ),
  );

  await closeDars();
}
main().catch(async (e) => { console.error("ERR:", (e as Error).message.split("\n")[0]); await closeDars(); process.exit(1); });

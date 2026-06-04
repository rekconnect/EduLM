import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";

async function main() {
  console.log("=== Invoices by Annee + currency (last 8 years) ===");
  console.table(
    await darsQuery(
      `SELECT TOP 16 Annee, Devise, COUNT(*) AS invoices,
              SUM(Total_a_payer_TTC) AS total, SUM(Restant_du) AS remaining
       FROM Fct_Factures_Entete WHERE Id_College = ${C}
       GROUP BY Annee, Devise ORDER BY Annee DESC, Devise`,
    ),
  );

  console.log("\n=== Statut values ===");
  console.table(
    await darsQuery(
      `SELECT Statut, COUNT(*) AS n FROM Fct_Factures_Entete WHERE Id_College = ${C} GROUP BY Statut`,
    ),
  );

  console.log("\n=== Current year (Annee 2026) summary by currency ===");
  console.table(
    await darsQuery(
      `SELECT Devise, COUNT(*) AS invoices,
              SUM(Total_a_payer_TTC) AS total_billed,
              SUM(Restant_du) AS total_remaining,
              SUM(Total_a_payer_TTC - Restant_du) AS total_paid
       FROM Fct_Factures_Entete WHERE Id_College = ${C} AND Annee = 2026
       GROUP BY Devise`,
    ),
  );

  console.log("\n=== Max invoice amount per currency (Int overflow check; Int max = 2,147,483,647) ===");
  console.table(
    await darsQuery(
      `SELECT Devise, MAX(Total_a_payer_TTC) AS max_amount, MAX(Total_a_payer_TTC)*100 AS max_times_100
       FROM Fct_Factures_Entete WHERE Id_College = ${C} GROUP BY Devise`,
    ),
  );

  console.log("\n=== Is invoice per-family or per-student? (Id_Eleve null?) ===");
  console.table(
    await darsQuery(
      `SELECT CASE WHEN Id_Eleve IS NULL THEN 'family-level (Id_Eleve NULL)' ELSE 'student-level' END AS kind,
              COUNT(*) AS n
       FROM Fct_Factures_Entete WHERE Id_College = ${C} GROUP BY CASE WHEN Id_Eleve IS NULL THEN 'family-level (Id_Eleve NULL)' ELSE 'student-level' END`,
    ),
  );

  console.log("\n=== Candidate payment/receipt tables (row counts) ===");
  for (const tbl of ["Cpt_ReglementTarif_Tmp", "Usr_Imp_Receipts", "Cpt_Transactions"]) {
    try {
      const r = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl} WHERE Id_College = ${C}`);
      console.log(`  ${tbl}: ${r[0]?.n}`);
    } catch {
      try {
        const r = await darsQuery<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl}`);
        console.log(`  ${tbl}: ${r[0]?.n} (no Id_College col)`);
      } catch (e) {
        console.log(`  ${tbl}: (error / not found)`);
      }
    }
  }

  await closeDars();
}
main().catch(async (e) => { console.error(e); await closeDars(); process.exit(1); });

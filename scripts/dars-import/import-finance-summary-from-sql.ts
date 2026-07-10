/**
 * Import a P&L summary from the Dars general ledger (Cpt_*) into FinanceSummary —
 * one row per fiscal year × currency × income/expense group. Read-only display
 * data for the finance dashboard; NOT a ledger import, no double-entry in EduLM.
 *
 * Fiscal year = Cpt_Period (Oct–Sep), matched by ledger line ValueDate.
 * INCOME = plan comptable class 7 (credit-positive); EXPENSE = class 6
 * (debit-positive). USD + LBP only (EUR is negligible). Group = 2-digit account
 * prefix; label from the matching GROUP account. Idempotent: replaces the
 * tenant's FinanceSummary rows every run.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-finance-summary-from-sql.ts \
 *     --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const toCents = (v: unknown): bigint => BigInt(Math.round((Number(v) || 0) * 100));

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // Group labels: the 2-digit GROUP accounts carry the category names.
  const groups = await darsQuery<{ GroupNumber: string; AccountDesc: string }>(
    `SELECT GroupNumber, AccountDesc FROM Cpt_Accounts
     WHERE Id_College=${C} AND AccountType='GROUP' AND LEN(RTRIM(GroupNumber))=2`,
  );
  const labelByGroup = new Map<string, string>();
  for (const g of groups) labelByGroup.set(String(g.GroupNumber).trim(), (g.AccountDesc || "").trim());

  // Ledger aggregated per fiscal period × currency × class × 2-digit group.
  const rows = await darsQuery<{
    fiscalYear: string;
    currency: string;
    cls: string;
    grp: string;
    label: string;
    net: number;
  }>(
    `SELECT p.PeriodName AS fiscalYear, tl.CcyCode AS currency,
       LEFT(a.AccountNo,1) AS cls, LEFT(a.AccountNo,2) AS grp, MAX(a.AccountDesc) AS label,
       SUM(CASE WHEN LEFT(a.AccountNo,1)='7'
         THEN (CASE WHEN tl.DbCr='C' THEN tl.Amount ELSE -tl.Amount END)
         ELSE (CASE WHEN tl.DbCr='D' THEN tl.Amount ELSE -tl.Amount END) END) AS net
     FROM Cpt_TransactionLines tl
     JOIN Cpt_Accounts a ON a.ID=tl.Id_Account AND a.Id_College=${C}
     JOIN Cpt_Period p ON p.Id_College=${C} AND tl.ValueDate >= p.StartDate AND tl.ValueDate <= p.EndDate
     WHERE tl.Id_College=${C} AND LEFT(a.AccountNo,1) IN ('6','7') AND tl.CcyCode IN ('USD','LBP')
     GROUP BY p.PeriodName, tl.CcyCode, LEFT(a.AccountNo,1), LEFT(a.AccountNo,2)`,
  );

  const data: Prisma.FinanceSummaryCreateManyInput[] = rows
    .filter((r) => Math.round((Number(r.net) || 0) * 100) !== 0)
    .map((r) => {
      const grp = String(r.grp).trim();
      return {
        tenantId: tenant.id,
        fiscalYear: String(r.fiscalYear).trim(),
        currency: r.currency,
        kind: r.cls === "7" ? "INCOME" : "EXPENSE",
        groupNo: grp,
        label: labelByGroup.get(grp) || (r.label || "").trim() || `Groupe ${grp}`,
        amountCents: toCents(r.net),
      };
    });

  const years = [...new Set(data.map((d) => d.fiscalYear))].sort().reverse();
  console.log(`\n${data.length} lignes · ${years.length} exercices avec données`);
  for (const y of years.slice(0, 8)) {
    for (const cur of ["USD", "LBP"]) {
      const sum = (kind: string) =>
        data
          .filter((d) => d.fiscalYear === y && d.currency === cur && d.kind === kind)
          .reduce((s, d) => s + Number(d.amountCents), 0) / 100;
      const inc = sum("INCOME");
      const exp = sum("EXPENSE");
      if (inc || exp)
        console.log(
          `  ${y} ${cur}: revenus ${inc.toLocaleString("fr-FR")} · dépenses ${exp.toLocaleString("fr-FR")} · résultat ${(inc - exp).toLocaleString("fr-FR")}`,
        );
    }
  }

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
    await prisma.$disconnect();
    await closeDars();
    return;
  }
  await prisma.financeSummary.deleteMany({ where: { tenantId: tenant.id } });
  for (let i = 0; i < data.length; i += 500)
    await prisma.financeSummary.createMany({ data: data.slice(i, i + 500) });
  console.log(`\n✓ ${data.length} lignes FinanceSummary importées.`);
  await prisma.$disconnect();
  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});

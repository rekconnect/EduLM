/**
 * Import a P&L summary from the Dars general ledger (Cpt_*) into FinanceSummary —
 * one row per fiscal year × currency × income/expense group. Read-only display
 * data for the finance dashboard; NOT a ledger import, no double-entry in EduLM.
 *
 * Fiscal year = the transaction's assigned accounting period (Cpt_Transactions.PeriodID
 * → Cpt_Period, Oct–Sep) — the accountant's explicit fiscal-year tag, more reliable than
 * matching ValueDate to a period window (some accruals post outside their period's dates).
 * Year-end CLOSING vouchers (TransactionTypeCode 'CL') are EXCLUDED: they debit income /
 * credit expense to zero the P&L accounts, so including them cancels the real operating
 * result to ~0 (this is why 2023-2024 was invisible before).
 * INCOME = plan comptable class 7 (credit-positive); EXPENSE = class 6
 * (debit-positive). USD + LBP only (EUR is negligible). Group = 2-digit account
 * prefix; label from the matching GROUP account. Idempotent: replaces the
 * tenant's FinanceSummary rows every run.
 *
 * MASSE SALARIALE (groupNo "MS"): since Oct 2024 the accountant stopped booking
 * salaries as class-6 expenses — payments sit on balance-sheet accounts
 * 4211.% "Rémunérations dues au Personnel" (+ the 4515.0007 salary intermediary)
 * and never reach the P&L, so recent years' Résultat is overstated. For fiscal
 * years that HAVE a real P&L (positive GL income — crisis years without one are
 * covered by the billing supplement instead) but whose booked group-63 LBP is
 * < 30% of LBP salary payments, we emit one EXPENSE row per currency with
 * groupNo "MS" = net payments minus whatever group-63 was booked. The dashboard
 * renders MS rows separately from GL categories.
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
     JOIN Cpt_Transactions t ON t.TrsID=tl.TrsID AND t.Id_College=${C}
     JOIN Cpt_Period p ON p.ID=t.PeriodID AND p.Id_College=${C}
     WHERE tl.Id_College=${C} AND LEFT(a.AccountNo,1) IN ('6','7') AND tl.CcyCode IN ('USD','LBP')
       AND RTRIM(t.TransactionTypeCode) <> 'CL'
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

  // Masse salariale: net salary PAYMENTS per fiscal year × currency (debits minus
  // credits on the personnel accounts, transfers between them cancel out).
  const salaryPayments = await darsQuery<{ fiscalYear: string; currency: string; net: number }>(
    `SELECT p.PeriodName AS fiscalYear, tl.CcyCode AS currency,
       SUM(CASE WHEN tl.DbCr='D' THEN tl.Amount ELSE -tl.Amount END) AS net
     FROM Cpt_TransactionLines tl
     JOIN Cpt_Accounts a ON a.ID=tl.Id_Account AND a.Id_College=${C}
     JOIN Cpt_Transactions t ON t.TrsID=tl.TrsID AND t.Id_College=${C}
     JOIN Cpt_Period p ON p.ID=t.PeriodID AND p.Id_College=${C}
     WHERE tl.Id_College=${C} AND tl.CcyCode IN ('USD','LBP')
       AND (a.AccountNo LIKE '4211.%' OR RTRIM(a.AccountNo)='4515.0007')
       AND RTRIM(t.TransactionTypeCode) NOT IN ('CL','OP','SCL')
     GROUP BY p.PeriodName, tl.CcyCode`,
  );
  const booked63 = new Map<string, number>(); // "year|ccy" -> booked group-63 expense
  for (const r of rows)
    if (String(r.grp).trim() === "63")
      booked63.set(`${String(r.fiscalYear).trim()}|${r.currency}`, Number(r.net) || 0);
  const payByYear = new Map<string, Map<string, number>>(); // year -> ccy -> payments
  for (const r of salaryPayments) {
    const y = String(r.fiscalYear).trim();
    const m = payByYear.get(y) ?? new Map<string, number>();
    m.set(r.currency, Number(r.net) || 0);
    payByYear.set(y, m);
  }
  for (const [y, byCcy] of payByYear) {
    const payLbp = byCcy.get("LBP") ?? 0;
    // Only years with a real P&L (positive GL income) where payroll never
    // (materially) reached class 6.
    const hasIncome = data.some(
      (d) => d.fiscalYear === y && d.kind === "INCOME" && Number(d.amountCents) > 0,
    );
    if (!hasIncome || payLbp <= 0 || (booked63.get(`${y}|LBP`) ?? 0) >= 0.3 * payLbp) continue;
    for (const [ccy, pay] of byCcy) {
      const amount = pay - (booked63.get(`${y}|${ccy}`) ?? 0);
      if (Math.round(amount * 100) <= 0) continue;
      data.push({
        tenantId: tenant.id,
        fiscalYear: y,
        currency: ccy,
        kind: "EXPENSE",
        groupNo: "MS",
        label: "Masse salariale (paiements)",
        amountCents: toCents(amount),
      });
    }
  }

  const years = [...new Set(data.map((d) => d.fiscalYear))].sort().reverse();
  console.log(`\n${data.length} lignes · ${years.length} exercices avec données`);
  for (const y of years.slice(0, 8)) {
    for (const cur of ["USD", "LBP"]) {
      const sum = (kind: string) =>
        data
          .filter((d) => d.fiscalYear === y && d.currency === cur && d.kind === kind && d.groupNo !== "MS")
          .reduce((s, d) => s + Number(d.amountCents), 0) / 100;
      const inc = sum("INCOME");
      const exp = sum("EXPENSE");
      const ms = data.find((d) => d.fiscalYear === y && d.currency === cur && d.groupNo === "MS");
      const msAmt = ms ? Number(ms.amountCents) / 100 : 0;
      if (inc || exp || msAmt)
        console.log(
          `  ${y} ${cur}: revenus ${inc.toLocaleString("fr-FR")} · dépenses ${exp.toLocaleString("fr-FR")} · résultat ${(inc - exp).toLocaleString("fr-FR")}` +
            (msAmt ? ` · MASSE SALARIALE ${msAmt.toLocaleString("fr-FR")} → résultat ajusté ${(inc - exp - msAmt).toLocaleString("fr-FR")}` : ""),
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

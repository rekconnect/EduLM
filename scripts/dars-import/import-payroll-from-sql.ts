/**
 * Import Dars payroll into PayrollEmployee + Payslip (read-only display).
 *  - Staff directory from Prs_Employee (+ latest Prs_EmplJobDesc → department /
 *    job title / employment type; Resigned → active flag).
 *  - Payslips from Pay_Salary: net LBP (NetAmount) + net USD (NetAmountUSD,
 *    usually null), stored ×100 in BigInt.
 * Payroll data spans 2018–2024, LBP-primary. Idempotent: replaces the tenant's
 * PayrollEmployee + Payslip rows every run.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-payroll-from-sql.ts \
 *     --tenant-name="Lycée Montaigne" [--confirm]
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const toCents = (v: unknown): bigint => BigInt(Math.round((Number(v) || 0) * 100));
const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};
const chunk = <T>(a: T[], n: number): T[][] => {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // Employment type id → name (column names vary; resolve dynamically).
  const ets = await darsQuery<Record<string, unknown>>(
    `SELECT * FROM Prs_EmploymentType WHERE Id_College=${C}`,
  ).catch(() => [] as Record<string, unknown>[]);
  const etMap = new Map<number, string>();
  for (const r of ets) {
    const idKey = Object.keys(r).find(
      (k) => /^id/i.test(k) && k.toLowerCase() !== "id_college" && typeof r[k] === "number",
    );
    const nameKey = Object.keys(r).find((k) => /type|name|desc/i.test(k) && typeof r[k] === "string");
    if (idKey && nameKey) etMap.set(Number(r[idKey]), String(r[nameKey]).trim());
  }

  const emps = await darsQuery<{
    ID: number;
    DisplayName: string | null;
    FirstName: string | null;
    LastName: string | null;
    RecruitmentDate: unknown;
    Resigned: boolean | null;
    ResignationDate: unknown;
    Id_EmploymentType: number | null;
    department: string | null;
    jobTitle: string | null;
  }>(
    `SELECT e.ID, e.DisplayName, e.FirstName, e.LastName, e.RecruitmentDate, e.Resigned, e.ResignationDate,
            jd.Id_EmploymentType, d.DepName AS department, j.JobTitle AS jobTitle
     FROM Prs_Employee e
     OUTER APPLY (SELECT TOP 1 * FROM Prs_EmplJobDesc jd
                  WHERE jd.Id_Empl=e.ID AND jd.Id_College=${C}
                  ORDER BY jd.CurrentDefault DESC, jd.ID DESC) jd
     LEFT JOIN Prs_Department d ON d.DepartmentID=jd.Id_Department AND d.Id_College=${C}
     LEFT JOIN Prs_JobTitle j ON j.ID=jd.Id_JobTitle AND j.Id_College=${C}
     WHERE e.Id_College=${C}`,
  );
  const slips = await darsQuery<{
    IDS: number;
    Id_Empl: number;
    SalaryYear: number;
    SalaryMonth: number;
    NetAmount: number;
    NetAmountUSD: number | null;
    IsPayed: boolean | null;
    SalaryDate: unknown;
  }>(
    `SELECT IDS, Id_Empl, SalaryYear, SalaryMonth, NetAmount, NetAmountUSD, IsPayed, SalaryDate
     FROM Pay_Salary WHERE Id_College=${C}`,
  );
  console.log(`Dars: ${emps.length} employés · ${slips.length} bulletins`);

  const empData = emps.map((e) => ({
    tenantId: tenant.id,
    darsEmplId: Number(e.ID),
    displayName: (e.DisplayName || `${e.FirstName ?? ""} ${e.LastName ?? ""}`).trim() || `#${e.ID}`,
    jobTitle: (e.jobTitle || "").trim() || null,
    department: (e.department || "").trim() || null,
    employmentType: e.Id_EmploymentType != null ? (etMap.get(Number(e.Id_EmploymentType)) ?? null) : null,
    active: !e.Resigned,
    recruitedAt: asDate(e.RecruitmentDate),
    resignedAt: asDate(e.ResignationDate),
  }));
  const active = empData.filter((e) => e.active).length;
  console.log(`  ${active} actifs · ${empData.length - active} démissionnaires`);

  const byMonth = new Map<string, { n: number; lbp: number; usd: number }>();
  for (const s of slips) {
    const k = `${s.SalaryYear}-${String(s.SalaryMonth).padStart(2, "0")}`;
    const m = byMonth.get(k) ?? { n: 0, lbp: 0, usd: 0 };
    m.n++;
    m.lbp += Number(s.NetAmount) || 0;
    m.usd += Number(s.NetAmountUSD) || 0;
    byMonth.set(k, m);
  }
  console.log("Derniers mois (masse salariale nette):");
  [...byMonth.entries()]
    .sort()
    .reverse()
    .slice(0, 4)
    .forEach(([k, m]) =>
      console.log(`  ${k}: ${m.n} bulletins · LBP ${m.lbp.toLocaleString("fr-FR")} · USD ${m.usd.toLocaleString("fr-FR")}`),
    );

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
    await prisma.$disconnect();
    await closeDars();
    return;
  }

  // Replace only IMPORTED rows (darsId set) — preserve anything created in EduLM.
  await prisma.payslip.deleteMany({ where: { tenantId: tenant.id, darsSalaryId: { not: null } } });
  await prisma.payrollEmployee.deleteMany({ where: { tenantId: tenant.id, darsEmplId: { not: null } } });
  for (const c of chunk(empData, 500)) await prisma.payrollEmployee.createMany({ data: c });
  const created = await prisma.payrollEmployee.findMany({
    where: { tenantId: tenant.id, darsEmplId: { not: null } },
    select: { id: true, darsEmplId: true },
  });
  const idByDars = new Map(created.map((e) => [e.darsEmplId, e.id]));
  const slipData = slips.flatMap((s) => {
    const employeeId = idByDars.get(Number(s.Id_Empl));
    return employeeId
      ? [{
          tenantId: tenant.id,
          employeeId,
          darsSalaryId: Number(s.IDS),
          year: Number(s.SalaryYear),
          month: Number(s.SalaryMonth),
          netLbpCents: toCents(s.NetAmount),
          netUsdCents: toCents(s.NetAmountUSD),
          paid: !!s.IsPayed,
          salaryDate: asDate(s.SalaryDate),
        }]
      : [];
  });
  for (const c of chunk(slipData, 2000)) await prisma.payslip.createMany({ data: c });
  console.log(`\n✓ ${empData.length} employés · ${slipData.length} bulletins importés.`);
  await prisma.$disconnect();
  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});

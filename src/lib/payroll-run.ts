import { db } from "./db";
import { countWorkingDays, isoDay } from "./working-days";
import {
  computePayslip,
  transportPerDayUsdCents,
  rateFor,
  type CompInput,
} from "./payroll-calc";

export type PayLine = {
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amountCents: number; // resolved for the month (per-day already × days)
  perDay: boolean;
  taxable: boolean;
};

export type CurrencyDetail = {
  earningsCents: number;
  deductionsCents: number;
  taxableBaseCents: number;
  taxCents: number;
  nfsCents: number;
  transportCents: number; // USD only in practice
  netCents: number;
  lines: PayLine[];
};

export type PayslipBreakdown = {
  year: number;
  month: number;
  workingDaysInMonth: number;
  absenceDays: number;
  permanenceDays: number;
  daysWorked: number;
  daysSource: "override" | "computed";
  transportPerDayUsdCents: number;
  byCurrency: Record<string, CurrencyDetail>;
};

export type EmployeePayslip = {
  employeeId: string;
  displayName: string;
  taxCategory: string | null;
  daysWorked: number;
  netUsdCents: number;
  netLbpCents: number;
  breakdown: PayslipBreakdown;
};

/**
 * Compute (not persist) the monthly payslip for every active employee.
 * Worked days = employee override, else (Mon–Fri working days in month −
 * approved ABSENCE working days in month + approved PRESENCE/PERMANENCE days).
 * Tax/NFS come from the employee's category rates; transport from the km formula
 * (USD). USD and LBP are kept separate. Must run inside runWithTenant.
 */
export async function computeMonthlyPayslips(
  year: number,
  month: number,
): Promise<EmployeePayslip[]> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of month

  const [employees, settings, holidays] = await Promise.all([
    db.payrollEmployee.findMany({
      where: { active: true },
      orderBy: { displayName: "asc" },
      include: { salaryComponents: true },
    }),
    db.tenantPayrollSettings.findFirst(),
    db.tenantHoliday.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      select: { date: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => isoDay(h.date)));
  const workingDaysInMonth = countWorkingDays(monthStart, monthEnd, holidaySet);
  const taxRates = settings?.taxRates ?? {};
  const nfsRates = settings?.nfsRates ?? {};
  const exchangeRate = settings?.exchangeRate ?? null;
  const transportCfg = settings
    ? {
        kmPerLitre: settings.kmPerLitre,
        fuelPriceCents: Number(settings.fuelPriceCents),
        fuelCurrency: settings.fuelPriceCurrency,
        minTransportCents: Number(settings.minTransportCents),
        exchangeRate,
      }
    : null;

  const empIds = employees.map((e) => e.id);
  const requests = empIds.length
    ? await db.attendanceRequest.findMany({
        where: {
          status: "APPROVED",
          employeeId: { in: empIds },
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: { employeeId: true, kind: true, startDate: true, endDate: true },
      })
    : [];
  const reqByEmp = new Map<string, typeof requests>();
  for (const r of requests) {
    const list = reqByEmp.get(r.employeeId) ?? [];
    list.push(r);
    reqByEmp.set(r.employeeId, list);
  }

  return employees.map((emp) => {
    const reqs = reqByEmp.get(emp.id) ?? [];
    // Absence working days that fall INSIDE this month (clip the request range).
    let absenceDays = 0;
    let permanenceDays = 0;
    for (const r of reqs) {
      if (r.kind === "ABSENCE") {
        const from = r.startDate > monthStart ? r.startDate : monthStart;
        const to = r.endDate < monthEnd ? r.endDate : monthEnd;
        absenceDays += countWorkingDays(from, to, holidaySet);
      } else if (r.kind === "PRESENCE" || r.kind === "PERMANENCE") {
        // A permanence/presence adds a paid day (even on a weekend — that's the point).
        if (r.startDate >= monthStart && r.startDate <= monthEnd) permanenceDays += 1;
      }
    }

    const override = emp.defaultDaysPerMonth;
    const daysSource: "override" | "computed" = override != null ? "override" : "computed";
    const daysWorked =
      override != null ? override : Math.max(0, workingDaysInMonth - absenceDays + permanenceDays);

    const comps: CompInput[] = emp.salaryComponents.map((c) => ({
      kind: c.kind,
      currency: c.currency,
      amountCents: Number(c.amountCents),
      perDay: c.perDay,
      taxable: c.taxable,
    }));
    const taxRate = rateFor(taxRates, emp.taxCategory);
    const nfsRate = rateFor(nfsRates, emp.taxCategory);
    const calc = computePayslip(comps, daysWorked, taxRate, nfsRate);

    // Transport (USD, formula) — added to the USD side, not taxed.
    const transportPerDay = transportCfg ? transportPerDayUsdCents(emp.kmDistance, transportCfg) : 0;
    const transportTotal = transportPerDay * daysWorked;

    const byCurrency: Record<string, CurrencyDetail> = {};
    const currencies = new Set<string>([...Object.keys(calc), ...(transportTotal > 0 ? ["USD"] : [])]);
    for (const ccy of currencies) {
      const g = calc[ccy];
      const transport = ccy === "USD" ? transportTotal : 0;
      const lines: PayLine[] = emp.salaryComponents
        .filter((c) => c.currency === ccy)
        .map((c) => ({
          label: c.label,
          kind: c.kind,
          amountCents: c.perDay ? Number(c.amountCents) * daysWorked : Number(c.amountCents),
          perDay: c.perDay,
          taxable: c.taxable,
        }));
      if (transport > 0) {
        lines.push({ label: "Transport", kind: "EARNING", amountCents: transport, perDay: true, taxable: false });
      }
      byCurrency[ccy] = {
        earningsCents: (g?.earningsCents ?? 0) + transport,
        deductionsCents: g?.deductionsCents ?? 0,
        taxableBaseCents: g?.taxableBaseCents ?? 0,
        taxCents: g?.taxCents ?? 0,
        nfsCents: g?.nfsCents ?? 0,
        transportCents: transport,
        netCents: (g?.netCents ?? 0) + transport,
        lines,
      };
    }

    return {
      employeeId: emp.id,
      displayName: emp.displayName,
      taxCategory: emp.taxCategory,
      daysWorked,
      netUsdCents: byCurrency.USD?.netCents ?? 0,
      netLbpCents: byCurrency.LBP?.netCents ?? 0,
      breakdown: {
        year,
        month,
        workingDaysInMonth,
        absenceDays,
        permanenceDays,
        daysWorked,
        daysSource,
        transportPerDayUsdCents: transportPerDay,
        byCurrency,
      },
    };
  });
}

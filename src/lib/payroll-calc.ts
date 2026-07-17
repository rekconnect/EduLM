/**
 * Monthly payslip computation — a faithful port of the Firebase payroll engine:
 *
 *   net = Σ earnings − Σ deductions − tax − NFS
 *   tax = taxableBase × taxRate[category]
 *   NFS = taxableBase × nfsRate[category]
 *   a per-day line contributes amount × daysWorked (so absences shrink transport)
 *   a fixed line contributes its full monthly amount (base is not prorated)
 *   taxableBase = Σ (taxable EARNING lines)   — "transport is alone", untaxed
 *
 * Everything is computed per currency (USD lines and LBP lines never mix), in
 * integer cents. `daysWorked` is resolved by the caller (working days in month −
 * approved absences + approved permanence, or a manual/default override).
 */

export type CompInput = {
  kind: "EARNING" | "DEDUCTION";
  currency: string; // "USD" | "LBP"
  amountCents: number; // monthly, or per-working-day when perDay
  perDay: boolean;
  taxable: boolean;
};

export type CurrencyBreakdown = {
  earningsCents: number;
  deductionsCents: number;
  taxableBaseCents: number;
  taxCents: number;
  nfsCents: number;
  netCents: number;
};

/**
 * @param components recurring pay lines
 * @param daysWorked effective paid days this month
 * @param taxRate    decimal (0.02 = 2%) for the employee's category
 * @param nfsRate    decimal for the employee's category
 * @returns per-currency breakdown, e.g. { USD: {...}, LBP: {...} }
 */
export function computePayslip(
  components: CompInput[],
  daysWorked: number,
  taxRate: number,
  nfsRate: number,
): Record<string, CurrencyBreakdown> {
  const days = Math.max(0, daysWorked);
  const byCcy: Record<string, CurrencyBreakdown> = {};
  const get = (ccy: string) =>
    (byCcy[ccy] ??= {
      earningsCents: 0,
      deductionsCents: 0,
      taxableBaseCents: 0,
      taxCents: 0,
      nfsCents: 0,
      netCents: 0,
    });

  for (const c of components) {
    const amount = c.perDay ? c.amountCents * days : c.amountCents;
    const g = get(c.currency);
    if (c.kind === "EARNING") {
      g.earningsCents += amount;
      if (c.taxable) g.taxableBaseCents += amount;
    } else {
      g.deductionsCents += amount;
    }
  }

  for (const g of Object.values(byCcy)) {
    g.taxCents = Math.round(g.taxableBaseCents * taxRate);
    g.nfsCents = Math.round(g.taxableBaseCents * nfsRate);
    g.netCents = g.earningsCents - g.deductionsCents - g.taxCents - g.nfsCents;
  }
  return byCcy;
}

/** Rate for a category from a settings rate map (decimals). Null/missing → 0. */
export function rateFor(rates: unknown, category: string | null): number {
  if (!category || typeof rates !== "object" || rates === null) return 0;
  const v = (rates as Record<string, unknown>)[category];
  return typeof v === "number" && isFinite(v) ? v : 0;
}

export type TransportSettings = {
  kmPerLitre: number;
  fuelPriceCents: number; // per litre, in fuelCurrency
  fuelCurrency: string; // "USD" | "LBP"
  minTransportCents: number; // per-day floor, USD cents
  exchangeRate: number | null; // LBP per USD (to convert an LBP fuel price)
};

/**
 * Transport allowance per working day, in USD cents — a faithful port of the
 * Firebase formula. All inputs come from editable tenant settings + the
 * employee's one-way km, so a fuel/rate change updates everyone at once.
 *   km ≤ 20            → the floor (minTransport)
 *   otherwise          → max( km ÷ kmPerLitre × fuelPrice × 2 (round trip), floor )
 */
export function transportPerDayUsdCents(km: number, s: TransportSettings): number {
  const floor = Math.max(0, Math.round(s.minTransportCents));
  if (!isFinite(km) || km <= 20) return floor;
  const fuelUsdCents =
    s.fuelCurrency === "USD"
      ? s.fuelPriceCents
      : s.exchangeRate && s.exchangeRate > 0
        ? s.fuelPriceCents / s.exchangeRate
        : 0;
  const perDay = (km / (s.kmPerLitre || 7.5)) * 2 * fuelUsdCents;
  return Math.max(Math.round(perDay), floor);
}

import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/money";
import type { PayslipBreakdown, CurrencyDetail } from "@/lib/payroll-run";

export type PayslipData = {
  employeeName: string;
  category: string | null;
  year: number;
  month: number;
  netUsdCents: number;
  netLbpCents: number;
  paid: boolean;
  breakdown: PayslipBreakdown | null;
  isDars: boolean;
};

/**
 * Printable pay slip — one styled document used by both the staff and admin
 * detail pages. Renders the stored per-currency breakdown (earnings, transport,
 * tax, NFS → net); falls back to net-only for Dars-imported slips with no
 * breakdown. Prints cleanly (the app chrome is hidden by the global print CSS).
 */
export async function PayslipDocument({
  data,
  tenantName,
  logoUrl,
}: {
  data: PayslipData;
  tenantName: string;
  logoUrl: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations("payslip"), getLocale()]);
  const period = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(data.year, data.month - 1, 1)),
  );
  const currencies = data.breakdown ? Object.keys(data.breakdown.byCurrency) : [];
  currencies.sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-8 shadow-card print:border-0 print:shadow-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-subtle)] pb-5">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-12 w-auto object-contain" />
          ) : null}
          <div>
            <p className="text-base font-semibold text-[color:var(--color-foreground)]">{tenantName}</p>
            <p className="text-sm text-[color:var(--color-foreground-muted)]">{t("title")}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-sm font-medium text-[color:var(--color-foreground)]">{period}</p>
          <span
            className={
              "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
              (data.paid
                ? "bg-[color:var(--color-success-soft)] text-[color:var(--color-success-soft-fg)]"
                : "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]")
            }
          >
            {data.paid ? t("paid") : t("unpaid")}
          </span>
        </div>
      </div>

      {/* Employee meta */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 py-5 text-sm sm:grid-cols-3">
        <Meta label={t("employee")} value={data.employeeName} />
        <Meta label={t("category")} value={data.category || "—"} />
        {data.breakdown ? <Meta label={t("daysWorked")} value={String(data.breakdown.daysWorked)} /> : null}
      </dl>

      {/* Breakdown, per currency */}
      {data.breakdown && currencies.length > 0 ? (
        <div className="space-y-6">
          {currencies.map((ccy) => (
            <CurrencySection key={ccy} ccy={ccy} d={data.breakdown!.byCurrency[ccy]} t={t} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data.netUsdCents > 0 ? <NetRow label={`${t("net")} — USD`} value={formatMoney(data.netUsdCents, "USD")} /> : null}
          {data.netLbpCents > 0 ? <NetRow label={`${t("net")} — LBP`} value={formatMoney(data.netLbpCents, "LBP")} /> : null}
          {data.isDars ? <p className="pt-2 text-xs text-[color:var(--color-foreground-subtle)]">{t("darsNote")}</p> : null}
        </div>
      )}

      <p className="mt-8 border-t border-[color:var(--color-border-subtle)] pt-3 text-center text-[10px] uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        {t("confidential")}
      </p>
    </div>
  );
}

function CurrencySection({
  ccy,
  d,
  t,
}: {
  ccy: string;
  d: CurrencyDetail;
  t: (k: string) => string;
}) {
  const earnings = d.lines.filter((l) => l.kind === "EARNING");
  const deductions = d.lines.filter((l) => l.kind === "DEDUCTION");
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">{ccy}</h3>
      <table className="w-full text-sm">
        <tbody>
          {earnings.map((l, i) => (
            <Row key={`e${i}`} label={l.label} value={formatMoney(l.amountCents, ccy)} />
          ))}
          <Row label={t("totalEarnings")} value={formatMoney(d.earningsCents, ccy)} strong />
          {deductions.map((l, i) => (
            <Row key={`d${i}`} label={l.label} value={`− ${formatMoney(l.amountCents, ccy)}`} muted />
          ))}
          {d.taxCents > 0 ? <Row label={t("tax")} value={`− ${formatMoney(d.taxCents, ccy)}`} muted /> : null}
          {d.nfsCents > 0 ? <Row label={t("nfs")} value={`− ${formatMoney(d.nfsCents, ccy)}`} muted /> : null}
          <tr className="border-t-2 border-[color:var(--color-border-strong)]">
            <td className="py-2 text-sm font-semibold text-[color:var(--color-foreground)]">{t("net")}</td>
            <td className="py-2 text-end text-base font-semibold tabular-nums text-[color:var(--color-foreground)]">
              {formatMoney(d.netCents, ccy)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <tr className="border-b border-[color:var(--color-border-subtle)]">
      <td className={"py-1.5 " + (strong ? "font-medium text-[color:var(--color-foreground)]" : muted ? "text-[color:var(--color-foreground-muted)]" : "text-[color:var(--color-foreground)]")}>
        {label}
      </td>
      <td className={"py-1.5 text-end tabular-nums " + (strong ? "font-medium text-[color:var(--color-foreground)]" : muted ? "text-[color:var(--color-foreground-muted)]" : "text-[color:var(--color-foreground)]")}>
        {value}
      </td>
    </tr>
  );
}

function NetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--color-border-subtle)] py-2">
      <span className="text-sm font-medium text-[color:var(--color-foreground)]">{label}</span>
      <span className="text-base font-semibold tabular-nums text-[color:var(--color-foreground)]">{value}</span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-muted)]">{label}</dt>
      <dd className="mt-0.5 text-[color:var(--color-foreground)]">{value}</dd>
    </div>
  );
}

/**
 * Internal storage is integer cents. Helpers below convert between cents and
 * a display string. Currency formatting uses Intl.NumberFormat — locale-aware
 * decimal/thousands separators, currency symbol placement, RTL support.
 */

export function centsToDecimalString(cents: number | bigint): string {
  const c = Number(cents);
  const sign = c < 0 ? "-" : "";
  const n = Math.abs(c);
  const whole = Math.floor(n / 100);
  const dec = (n % 100).toString().padStart(2, "0");
  return `${sign}${whole}.${dec}`;
}

export function decimalStringToCents(value: string): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/,/g, ".");
  if (trimmed === "") return null;
  const match = trimmed.match(/^(-?\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = parseInt(match[1]!, 10);
  const dec = (match[2] ?? "0").padEnd(2, "0").slice(0, 2);
  const decNum = parseInt(dec, 10);
  return whole * 100 + (whole < 0 ? -decNum : decNum);
}

export function formatMoney(
  cents: number | bigint,
  currency: string,
  locale = "fr-FR",
): string {
  const c = Number(cents);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    }).format(c / 100);
  } catch {
    return `${centsToDecimalString(c)} ${currency}`;
  }
}

/** Sum line totals (cents × quantity). Accepts BigInt columns from Prisma. */
export function sumLines(lines: { amountCents: number | bigint; quantity: number }[]): number {
  return lines.reduce((acc, l) => acc + Number(l.amountCents) * l.quantity, 0);
}

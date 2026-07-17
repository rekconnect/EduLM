import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { SettingsForm, type CategoryRow } from "./_settings-form";

const numStr = (v: number | null | undefined) => (v == null ? "" : String(v));
const centsStr = (v: bigint) => (v === 0n ? "" : String(Number(v) / 100));

export default async function PayrollSettingsPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [settings, usedCategories] = await Promise.all([
      db.tenantPayrollSettings.findUnique({ where: { tenantId } }),
      db.payrollEmployee.findMany({
        where: { taxCategory: { not: null } },
        select: { taxCategory: true },
        distinct: ["taxCategory"],
      }),
    ]);

    const taxRates = (settings?.taxRates ?? {}) as Record<string, number>;
    const nfsRates = (settings?.nfsRates ?? {}) as Record<string, number>;
    // Categories = those with rates + any used by employees but not yet rated.
    const names = new Set<string>([
      ...Object.keys(taxRates),
      ...Object.keys(nfsRates),
      ...usedCategories.map((e) => e.taxCategory!).filter(Boolean),
    ]);
    const categories: CategoryRow[] = [...names].sort().map((name) => ({
      name,
      taxPct: taxRates[name] != null ? String(taxRates[name] * 100) : "",
      nfsPct: nfsRates[name] != null ? String(nfsRates[name] * 100) : "",
    }));

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader
          title="Paramètres de paie"
          description="Taux NSF/impôt, transport, taux de change — modifiables à tout moment"
          action={
            <Link href="/payroll" className="text-sm text-[color:var(--color-brand-600)] hover:underline">
              ← Personnel
            </Link>
          }
        />
        <Card>
          <CardBody>
            <SettingsForm
              initial={{
                exchangeRate: numStr(settings?.exchangeRate ?? null),
                workingDaysPerMonth: String(settings?.workingDaysPerMonth ?? 22),
                fuelPrice: settings ? centsStr(settings.fuelPriceCents) : "",
                fuelPriceCurrency: settings?.fuelPriceCurrency ?? "USD",
                minTransport: settings ? centsStr(settings.minTransportCents) : "",
                kmPerLitre: numStr(settings?.kmPerLitre ?? 7.5),
                categories,
              }}
            />
          </CardBody>
        </Card>
      </main>
    );
  });
}

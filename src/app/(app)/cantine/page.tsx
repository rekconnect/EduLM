import { PageHeader } from "@/components/shell/page-header";
import { withTenantSession } from "@/lib/session";
import { registerCantineStudent, setCantineServices } from "../students/_actions";
import { ServicesList } from "./_list";
import { CantineRegister } from "./_register";
import { loadCantineRows } from "./_data";

/**
 * Cantine / Collation list: every active-year student registered for the
 * canteen and/or the snack, per the accounting-synced services_by_year.
 * Read-only (the accounting Excel is the source) — filter, sort, 50/page,
 * Excel + PDF exports.
 */
export default async function CantinePage() {
  return withTenantSession(async (user) => {
    if (user.role !== "SCHOOL_ADMIN") {
      return (
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-sm text-[color:var(--color-foreground-muted)]">
            Accès réservé aux administrateurs.
          </p>
        </main>
      );
    }

    const { rows, yearLabel, candidates } = await loadCantineRows();

    return (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <PageHeader
          title="Cantine / Collation"
          description={`Inscrits aux services de restauration · ${yearLabel}`}
        />
        <CantineRegister candidates={candidates} onRegister={registerCantineStudent} />
        <ServicesList rows={rows} onSet={setCantineServices} />
      </main>
    );
  });
}

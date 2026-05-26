import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import { DossierForm, type EstablishmentOption } from "./_form";

export default async function NewDossierPage() {
  return withTenantSession(async (user) => {
    if (user.role !== "PARENT") redirect("/dashboard");
    const t = await getTranslations("admissions");
    const tCommon = await getTranslations("common");

    // Active, currently-open cycles + the tenant's establishment list, in
    // parallel since they're independent.
    const now = new Date();
    const [activeCycles, establishments, tenant] = await Promise.all([
      db.admissionCycle.findMany({
        where: {
          isActive: true,
          openAt: { lte: now },
          OR: [{ closeAt: null }, { closeAt: { gte: now } }],
        },
        orderBy: { openAt: "desc" },
        select: { id: true, label: true, targetYearLabel: true },
      }),
      db.establishment.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, levels: true },
      }),
      user.tenantId
        ? db.tenant
            .findUnique({
              where: { id: user.tenantId },
              select: { name: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    if (activeCycles.length === 0) notFound();

    // Coerce Establishment.levels (Json) into a flat string[].
    const establishmentOptions: EstablishmentOption[] = establishments.map(
      (e) => ({
        id: e.id,
        name: e.name,
        levels: Array.isArray(e.levels)
          ? (e.levels.filter((x) => typeof x === "string") as string[])
          : [],
      }),
    );

    return (
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <PageHeader
          title={t("createDossierTitle")}
          description={t("createDossierLead")}
          action={
            <Link
              href="/parent/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {tCommon("back")}
            </Link>
          }
        />
        <DossierForm
          cycles={activeCycles}
          establishments={establishmentOptions}
          schoolName={tenant?.name ?? ""}
        />
      </main>
    );
  });
}

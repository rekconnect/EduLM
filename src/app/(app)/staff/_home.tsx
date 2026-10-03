import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Baby, LayoutGrid, Lock, ShieldCheck } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import {
  ADMIN_MODULES,
  type AdminAccess,
  type AdminModule,
  moduleLevel,
} from "@/lib/permissions-shared";

/** First page of each module — where "Mes espaces" sends the person. */
const MODULE_HOME: Record<AdminModule, string> = {
  eleves: "/students",
  facturation: "/billing",
  paie: "/payroll",
  services: "/transport",
  infirmerie: "/infirmerie",
  rapports: "/reports",
  formulaires: "/admin/inscription-config",
  admissions: "/admissions-admin",
  communication: "/admin/messages",
};

/**
 * Staff home for personnel WITHOUT a payroll record (today: everyone — the
 * Dars payroll data is obsolete): the modules they were granted, and, for a
 * parent who is also personnel, their "Mes enfants" space. The payroll-based
 * home (payslips, requests) takes over once a PayrollEmployee is linked.
 */
export async function StaffNeutralHome({
  access,
  childrenCount,
}: {
  access: AdminAccess;
  childrenCount: number;
}) {
  const [t, tPerm] = await Promise.all([
    getTranslations("staff"),
    getTranslations("adminPermissions"),
  ]);
  const spaces = ADMIN_MODULES.map((m) => ({ m, level: moduleLevel(access, m) })).filter(
    (x): x is { m: AdminModule; level: NonNullable<ReturnType<typeof moduleLevel>> } =>
      x.level !== null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("mySpaces")}
          description={spaces.length ? t("mySpacesHint") : undefined}
        />
        <CardBody>
          {spaces.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3">
              <Lock
                className="mt-0.5 size-4 shrink-0 text-[color:var(--color-foreground-muted)]"
                aria-hidden
              />
              <p className="text-sm text-[color:var(--color-foreground-muted)]">
                {t("noSpaces")}
              </p>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {spaces.map(({ m, level }) => (
                <li key={m}>
                  <Link
                    href={MODULE_HOME[m]}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-4 py-3 transition-colors duration-150 ease-out hover:border-[color:var(--color-brand-500)]/50 hover:bg-[color:var(--color-brand-50)]/40"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                        <LayoutGrid className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[color:var(--color-foreground)]">
                          {tPerm(`module_${m}`)}
                        </span>
                        <span className="block text-xs text-[color:var(--color-foreground-subtle)]">
                          <ShieldCheck className="me-1 inline size-3 align-[-2px]" aria-hidden />
                          {tPerm(`level_${level}`)}
                        </span>
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 shrink-0 text-[color:var(--color-foreground-subtle)] transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {childrenCount > 0 ? (
        <Card>
          <CardHeader
            title={t("myChildren")}
            description={t("myChildrenHint", { count: childrenCount })}
          />
          <CardBody>
            <Link
              href="/parent/dashboard"
              className="group inline-flex items-center gap-2 rounded-md bg-[color:var(--color-brand-500)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-600)]"
            >
              <Baby className="size-4" aria-hidden />
              {t("openParentSpace")}
              <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

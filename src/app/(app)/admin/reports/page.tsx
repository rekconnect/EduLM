import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Bus,
  CreditCard,
  Flag,
  GraduationCap,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/session";

const REPORTS = [
  { key: "transport", icon: Bus, href: "/admin/reports/transport" },
  { key: "finance", icon: CreditCard, href: "/admin/reports/finance" },
  { key: "pedagogique", icon: GraduationCap, href: "/admin/reports/pedagogique" },
  { key: "nationalites", icon: Flag, href: "/admin/reports/nationalites" },
] as const;

export default async function ReportsLandingPage() {
  await requireRole("SCHOOL_ADMIN");
  const t = await getTranslations("reports");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTS.map(({ key, icon: Icon, href }) => (
          <Link key={key} href={href} className="group">
            <Card className="h-full transition-shadow duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]">
              <CardBody className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[color:var(--color-foreground)] transition-colors group-hover:text-[color:var(--color-brand-600)]">
                    {t(`${key}.title`)}
                  </h3>
                  <p className="mt-1 text-xs text-[color:var(--color-foreground-muted)]">
                    {t(`${key}.description`)}
                  </p>
                </div>
                <ArrowRight className="size-4 text-[color:var(--color-foreground-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--color-brand-600)] rtl:rotate-180" aria-hidden />
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}

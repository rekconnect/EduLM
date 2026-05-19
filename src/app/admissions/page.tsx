import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarClock, Coins, GraduationCap, Sparkles } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { unscopedDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export default async function AdmissionsLandingPage() {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) notFound();

  const t = await getTranslations("admissions");

  const db = unscopedDb();
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  const now = new Date();
  const openCycles = await db.admissionCycle.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      openAt: { lte: now },
      OR: [{ closeAt: null }, { closeAt: { gte: now } }],
    },
    orderBy: { openAt: "desc" },
    select: {
      id: true,
      label: true,
      targetYearLabel: true,
      closeAt: true,
      inscriptionFeeCents: true,
      currency: true,
      description: true,
    },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--color-foreground-subtle)]">
          <Sparkles className="size-3" aria-hidden />
          EduLM · {tenant.name}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[color:var(--color-foreground)] sm:text-5xl">
          {t("publicTitle", { tenantName: tenant.name })}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[color:var(--color-foreground-muted)]">
          {t("publicLead")}
        </p>
      </div>

      {openCycles.length === 0 ? (
        <Card className="mt-10 animate-in fade-in duration-500 motion-reduce:animate-none">
          <CardBody>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]">
                <CalendarClock className="size-5" aria-hidden />
              </div>
              <p className="pt-1.5 text-[color:var(--color-foreground-muted)]">
                {t("noCycleOpen")}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <section className="mt-10 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
            {t("cycleOpenLabel")}
          </p>
          <div className="space-y-3">
            {openCycles.map((c, i) => (
              <div
                key={c.id}
                className="animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none"
                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              >
                <Card className="transition-shadow duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]">
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                        <GraduationCap className="size-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-semibold tracking-tight text-[color:var(--color-foreground)]">
                          {c.label}
                        </h2>
                        {c.description ? (
                          <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-foreground-muted)]">
                            {c.description}
                          </p>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {c.closeAt ? (
                            <InfoChip icon={CalendarClock} label={t("deadlineLabel")}>
                              {c.closeAt.toISOString().slice(0, 10)}
                            </InfoChip>
                          ) : null}
                          {c.inscriptionFeeCents && c.inscriptionFeeCents > 0 ? (
                            <InfoChip icon={Coins} label={t("feeLabel")}>
                              {formatMoney(c.inscriptionFeeCents, c.currency)}
                            </InfoChip>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-4 animate-in fade-in duration-500 motion-reduce:animate-none">
        <LinkButton href={`/t/${slug}/sign-up`} className="gap-1.5">
          {t("ctaStart")}
          <ArrowRight className="size-4" aria-hidden />
        </LinkButton>
        <Link
          href={`/t/${slug}/sign-in`}
          className="text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
        >
          {t("ctaSignIn")}
        </Link>
      </div>
    </main>
  );
}

function InfoChip({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarClock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-3 py-1 text-xs text-[color:var(--color-foreground)]">
      <Icon
        className="size-3 text-[color:var(--color-foreground-muted)]"
        aria-hidden
      />
      <span className="text-[color:var(--color-foreground-muted)]">{label}:</span>
      <span className="font-medium tabular-nums">{children}</span>
    </span>
  );
}

import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
  try {
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
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs uppercase tracking-widest text-[color:var(--muted-fg)]">
          EduLM · {tenant.name}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("publicTitle", { tenantName: tenant.name })}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[color:var(--muted-fg)]">
          {t("publicLead")}
        </p>

        {openCycles.length === 0 ? (
          <Card className="mt-10">
            <CardBody>
              <p className="text-[color:var(--muted-fg)]">{t("noCycleOpen")}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="mt-10 space-y-4">
            {openCycles.map((c) => (
              <Card key={c.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[color:var(--muted-fg)]">
                        {t("cycleOpenLabel")}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">{c.label}</h2>
                      {c.description ? (
                        <p className="mt-2 text-sm text-[color:var(--muted-fg)]">
                          {c.description}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-[color:var(--muted-fg)]">
                        {c.closeAt ? (
                          <span>
                            <span className="font-medium">{t("deadlineLabel")}: </span>
                            {c.closeAt.toISOString().slice(0, 10)}
                          </span>
                        ) : null}
                        {c.inscriptionFeeCents && c.inscriptionFeeCents > 0 ? (
                          <span>
                            <span className="font-medium">{t("feeLabel")}: </span>
                            {formatMoney(c.inscriptionFeeCents, c.currency)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <LinkButton href={`/t/${slug}/sign-up`}>{t("ctaStart")}</LinkButton>
          <Link
            href={`/t/${slug}/sign-in`}
            className="text-sm text-[color:var(--muted-fg)] hover:underline"
          >
            {t("ctaSignIn")}
          </Link>
        </div>
      </main>
    );
  } finally {
    await db.$disconnect();
  }
}

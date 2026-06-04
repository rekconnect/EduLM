import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Role } from "@prisma/client";
import { ArrowRight, GraduationCap, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { StaggerGrid } from "@/components/ui/stagger-grid";
import { db } from "@/lib/db";
import { withParentSession } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { startRenewal } from "../applications/_actions";

const CARD_HOVER =
  "transition-shadow duration-200 ease-out hover:shadow-[var(--shadow-card-hover)] hover:border-[color:var(--color-border-strong)]";

export default async function ParentDashboardPage() {
  return withParentSession(async (user, childIds) => {
    const t = await getTranslations("parent");
    const tAdm = await getTranslations("admissions");

    if (childIds.length === 0) {
      return <NoChildrenState user={user} />;
    }

    const now = new Date();

    const [children, openCycles, existingRenewals, openDossiers] = await Promise.all([
      db.student.findMany({
        where: { id: { in: childIds } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          // Pull a few enrollments so we can fall back to upcoming-year if no
          // current-year enrollment exists (newly-accepted children).
          enrollments: {
            orderBy: { academicYear: { startDate: "desc" } },
            take: 3,
            select: {
              class: { select: { name: true } },
              academicYear: {
                select: { label: true, isActive: true, startDate: true },
              },
            },
          },
          invoices: {
            select: {
              totalCents: true,
              currency: true,
              payments: { select: { amountCents: true } },
            },
          },
        },
      }),
      db.admissionCycle.findMany({
        where: {
          isActive: true,
          openAt: { lte: now },
          OR: [{ closeAt: null }, { closeAt: { gte: now } }],
        },
        orderBy: { openAt: "desc" },
        select: { id: true, label: true, targetYearLabel: true },
      }),
      db.application.findMany({
        where: {
          OR: [
            { existingStudentId: { in: childIds } },
            { resultingStudentId: { in: childIds } },
          ],
          status: { not: "WITHDRAWN" },
        },
        select: {
          existingStudentId: true,
          resultingStudentId: true,
          cycleId: true,
          id: true,
          status: true,
        },
      }),
      // "Inscription" section: new-student dossiers submitted by THIS parent,
      // not yet linked to a Student row (those are renewals, already shown
      // under each kid). Hide WITHDRAWN. Decided ACCEPTED applications appear
      // as children in the section above once enrollments exist.
      db.application.findMany({
        where: {
          submittedByUserId: user.id,
          existingStudentId: null,
          status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_SCHEDULED", "WAITLISTED"] },
          archived: false,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          childFirstName: true,
          childLastName: true,
          niveau: true,
          updatedAt: true,
          cycle: { select: { id: true, label: true, targetYearLabel: true } },
          establishment: { select: { name: true } },
        },
      }),
    ]);

    // Map any application that already targets one of our kids — either as a
    // renewal of an existing student or as a NEW application that resulted in
    // that student (newly-accepted Carelle case). Either way, we shouldn't
    // offer "+ Renewal" for that child × cycle again.
    const renewalMap = new Map<string, { id: string; status: string }>();
    for (const r of existingRenewals) {
      const studentId = r.existingStudentId ?? r.resultingStudentId;
      if (studentId) {
        renewalMap.set(`${studentId}::${r.cycleId}`, {
          id: r.id,
          status: r.status,
        });
      }
    }

    return (
        <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
          <PageHeader
            title={t("dashboardTitle")}
            description={t("welcome", { name: user.name ?? user.email })}
          />

          {openCycles.length > 0 ? (
            <InscriptionSection
              cycles={openCycles}
              dossiers={openDossiers}
              labels={{
                heading:
                  openCycles[0]
                    ? `${tAdm("inscriptionSectionTitle")} ${openCycles[0].targetYearLabel}`
                    : tAdm("inscriptionSectionTitle"),
                empty: tAdm("inscriptionSectionEmpty"),
                create: tAdm("createDossierCta"),
                statusDraft: tAdm("statusDraft"),
                statusSubmitted: tAdm("statusSubmitted"),
                statusUnderReview: tAdm("statusUnderReview"),
                statusInterview: tAdm("statusInterview"),
                statusWaitlisted: tAdm("statusWaitlisted"),
                continue: tAdm("continueDossier"),
              }}
            />
          ) : null}

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
              {t("childrenTitle")}
            </h2>
            <StaggerGrid className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {children.map((c) => {
                // Prefer the active-year enrollment; fall back to an upcoming
                // year (newly-accepted kids) before showing "—".
                const nowTs = Date.now();
                const activeEnrollment = c.enrollments.find(
                  (e) => e.academicYear.isActive,
                );
                const upcomingEnrollment = c.enrollments.find(
                  (e) =>
                    !e.academicYear.isActive &&
                    e.academicYear.startDate.getTime() > nowTs,
                );
                const enrollment = activeEnrollment ?? upcomingEnrollment;
                const klass = enrollment?.class.name ?? "—";
                const klassYearHint =
                  enrollment && !enrollment.academicYear.isActive
                    ? ` · ${enrollment.academicYear.label}`
                    : "";

                const balanceByCurrency = new Map<string, number>();
                for (const inv of c.invoices) {
                  const paid = inv.payments.reduce((a, p) => a + p.amountCents, 0);
                  const bal = inv.totalCents - paid;
                  if (bal > 0) {
                    balanceByCurrency.set(
                      inv.currency,
                      (balanceByCurrency.get(inv.currency) ?? 0) + bal,
                    );
                  }
                }

                return (
                  <Card key={c.id} className={CARD_HOVER}>
                    <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
                      <ChildInitials firstName={c.firstName} lastName={c.lastName} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-[color:var(--color-foreground)]">
                          {c.firstName} {c.lastName}
                        </h3>
                        <p className="truncate text-xs text-[color:var(--color-foreground-muted)]">
                          {t("currentClass")}: {klass}
                          {klassYearHint}
                        </p>
                      </div>
                    </div>

                    <CardBody className="space-y-4">
                      {balanceByCurrency.size > 0 ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-3 py-2 text-sm text-[color:var(--color-warning-soft-fg)]">
                          <span className="font-medium">{t("outstanding")}:</span>
                          {Array.from(balanceByCurrency.entries()).map(([cur, bal]) => (
                            <span key={cur} className="tabular-nums">
                              {formatMoney(bal, cur)}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {openCycles.length > 0 ? (
                        <div className="space-y-1.5 border-t border-[color:var(--color-border-subtle)] pt-3">
                          {openCycles.map((cycle) => {
                            const existing = renewalMap.get(`${c.id}::${cycle.id}`);
                            if (existing) {
                              return (
                                <Link
                                  key={cycle.id}
                                  href={`/parent/inscriptions/${existing.id}/edit`}
                                  className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-success)]/30 bg-[color:var(--color-success-soft)] px-3 py-2 text-sm text-[color:var(--color-success-soft-fg)] transition-colors hover:bg-[color:var(--color-success-soft)]/80"
                                >
                                  <span className="flex items-center gap-2">
                                    <RefreshCw className="size-3.5" aria-hidden />
                                    <span className="font-medium">{tAdm("renewalBadge")}</span>
                                    <span className="opacity-80">
                                      {cycle.targetYearLabel}
                                    </span>
                                  </span>
                                  <span className="text-xs font-medium uppercase tracking-wider">
                                    {existing.status}
                                  </span>
                                </Link>
                              );
                            }
                            return (
                              <form
                                key={cycle.id}
                                action={startRenewal}
                                className="flex items-center justify-between gap-2 rounded-md bg-[color:var(--color-surface-sunken)] px-3 py-2"
                              >
                                <input type="hidden" name="studentId" value={c.id} />
                                <input type="hidden" name="cycleId" value={cycle.id} />
                                <span className="min-w-0 truncate text-sm text-[color:var(--color-foreground-muted)]">
                                  {tAdm("renewCta", { year: cycle.targetYearLabel })}
                                </span>
                                <Button type="submit" size="sm" className="shrink-0 gap-1">
                                  <Plus className="size-3.5" aria-hidden />
                                  {tAdm("renewalBadge")}
                                </Button>
                              </form>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="flex justify-end">
                        <LinkButton
                          href={`/parent/children/${c.id}`}
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                        >
                          {t("viewChild")}
                          <ArrowRight className="size-3.5" aria-hidden />
                        </LinkButton>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </StaggerGrid>
          </section>
        </main>
    );
  });
}

async function NoChildrenState({
  user,
}: {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    tenantId: string;
  };
}) {
  const t = await getTranslations("parent");
  const apps = await db.application.findMany({
    where: { submittedByUserId: user.id, archived: false, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { cycle: { select: { label: true } } },
  });

  return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader
          title={t("dashboardTitle")}
          description={t("welcome", { name: user.name ?? user.email })}
        />

        <Card className={CARD_HOVER}>
          <CardBody>
            {apps.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                  <GraduationCap className="size-6" aria-hidden />
                </div>
                <p className="text-sm text-[color:var(--color-foreground-muted)]">
                  {t("noChildren")}
                </p>
                <div className="mt-5">
                  <LinkButton href="/parent/inscriptions/new" className="gap-1.5">
                    <Plus className="size-4" aria-hidden />
                    Nouvelle inscription
                  </LinkButton>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  Mes dossiers
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {apps.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/parent/inscriptions/${a.id}/edit`}
                        className="flex items-center justify-between rounded-md border border-[color:var(--color-border-subtle)] px-3 py-2 transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
                      >
                        <span>
                          <span className="font-medium text-[color:var(--color-foreground)]">
                            {a.childFirstName || "—"} {a.childLastName || ""}
                          </span>
                          <span className="ms-2 text-xs text-[color:var(--color-foreground-muted)]">
                            {a.cycle.label}
                          </span>
                        </span>
                        <span className="text-xs uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
                          {a.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Link
                    href="/parent/applications"
                    className="inline-flex items-center gap-1 text-sm text-[color:var(--color-brand-600)] transition-colors hover:text-[color:var(--color-brand-700)] hover:underline"
                  >
                    Voir tous mes dossiers
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </main>
  );
}

function ChildInitials({
  firstName,
  lastName,
}: {
  firstName: string;
  lastName: string;
}) {
  const initials = `${firstName.charAt(0) || ""}${lastName.charAt(0) || ""}`
    .toUpperCase()
    .trim();
  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-sm font-semibold text-[color:var(--color-brand-700)]"
    >
      {initials || "·"}
    </div>
  );
}

/**
 * Inscription section shown to parents when an admissions cycle is open.
 * Lists any in-progress dossiers + a "+ Créer un dossier" CTA. Status chips
 * mirror the wizard's terminology: DRAFT = en cours / non envoyée;
 * SUBMITTED = envoyée; UNDER_REVIEW + INTERVIEW = côté école.
 */
function InscriptionSection({
  cycles,
  dossiers,
  labels,
}: {
  cycles: Array<{ id: string; label: string; targetYearLabel: string }>;
  dossiers: Array<{
    id: string;
    status: string;
    childFirstName: string;
    childLastName: string;
    niveau: string | null;
    cycle: { id: string; label: string; targetYearLabel: string };
    establishment: { name: string } | null;
  }>;
  labels: {
    heading: string;
    empty: string;
    create: string;
    statusDraft: string;
    statusSubmitted: string;
    statusUnderReview: string;
    statusInterview: string;
    statusWaitlisted: string;
    continue: string;
  };
}) {
  const statusLabel = (status: string): { text: string; tone: string } => {
    switch (status) {
      case "DRAFT":
        return {
          text: labels.statusDraft,
          tone:
            "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
        };
      case "SUBMITTED":
        return {
          text: labels.statusSubmitted,
          tone:
            "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-700)]",
        };
      case "UNDER_REVIEW":
        return {
          text: labels.statusUnderReview,
          tone:
            "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
        };
      case "INTERVIEW_SCHEDULED":
        return {
          text: labels.statusInterview,
          tone:
            "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
        };
      case "WAITLISTED":
        return {
          text: labels.statusWaitlisted,
          tone:
            "bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning-soft-fg)]",
        };
      default:
        return {
          text: status,
          tone:
            "bg-[color:var(--color-surface-sunken)] text-[color:var(--color-foreground-muted)]",
        };
    }
  };

  return (
    <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
          {labels.heading}
        </h2>
        <LinkButton href="/parent/inscriptions/new" size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          {labels.create}
        </LinkButton>
      </div>

      {dossiers.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-muted)]">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {dossiers.map((d) => {
            const s = statusLabel(d.status);
            return (
              <li key={d.id}>
                <Link
                  href={`/parent/inscriptions/${d.id}/edit`}
                  className={cn(
                    "group flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-4 py-3 transition-colors",
                    "hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                        {d.childLastName} {d.childFirstName}
                      </span>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          s.tone,
                        )}
                      >
                        {s.text}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--color-foreground-muted)]">
                      {d.cycle.label} · {d.cycle.targetYearLabel}
                      {d.establishment ? ` · ${d.establishment.name}` : ""}
                      {d.niveau ? ` · ${d.niveau}` : ""}
                    </div>
                  </div>
                  <ArrowRight
                    className="size-4 shrink-0 text-[color:var(--color-foreground-subtle)] group-hover:text-[color:var(--color-brand-600)]"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


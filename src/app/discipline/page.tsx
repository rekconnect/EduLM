import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/shell/app-header";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";

const SEVERITY_LABEL: Record<string, string> = {
  NOTE: "severityNote",
  WARNING: "severityWarning",
  DETENTION: "severityDetention",
  SUSPENSION: "severitySuspension",
};

const SEVERITY_TONE: Record<string, string> = {
  NOTE: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  WARNING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  DETENTION: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  SUSPENSION: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
};

export default async function DisciplinePage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const { severity } = await searchParams;

  return withTenantSession(async (user) => {
    const t = await getTranslations("discipline");

    const where = severity && ["NOTE", "WARNING", "DETENTION", "SUSPENSION"].includes(severity)
      ? { severity: severity as "NOTE" | "WARNING" | "DETENTION" | "SUSPENSION" }
      : undefined;

    const events = await db.disciplineEvent.findMany({
      where,
      orderBy: { date: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        reportedBy: { select: { name: true, email: true } },
      },
    });

    return (
      <div className="min-h-screen">
        <AppHeader role={user.role} userLabel={user.name ?? user.email} />
        <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("subtitle")}
            action={
              <LinkButton href="/discipline/new" size="sm">
                {t("createCta")}
              </LinkButton>
            }
          />

          <Card>
            <CardBody>
              <form method="get" className="max-w-xs">
                <Field label={t("fieldSeverity")} htmlFor="severity">
                  <Select id="severity" name="severity" defaultValue={severity ?? ""}>
                    <option value="">{t("filterAll")}</option>
                    <option value="NOTE">{t("severityNote")}</option>
                    <option value="WARNING">{t("severityWarning")}</option>
                    <option value="DETENTION">{t("severityDetention")}</option>
                    <option value="SUSPENSION">{t("severitySuspension")}</option>
                  </Select>
                </Field>
              </form>
            </CardBody>
          </Card>

          <Table>
            <THead>
              <tr>
                <TH>{t("colDate")}</TH>
                <TH>{t("colStudent")}</TH>
                <TH>{t("colType")}</TH>
                <TH>{t("colSeverity")}</TH>
                <TH>{t("colReporter")}</TH>
              </tr>
            </THead>
            <tbody>
              {events.length === 0 ? (
                <EmptyRow colSpan={5}>{t("empty")}</EmptyRow>
              ) : (
                events.map((e) => (
                  <TR key={e.id}>
                    <TD className="tabular-nums text-[color:var(--muted-fg)]">
                      {e.date.toISOString().slice(0, 10)}
                    </TD>
                    <TD>
                      <Link
                        href={`/students/${e.student.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.student.lastName} {e.student.firstName}
                      </Link>
                    </TD>
                    <TD>{e.type}</TD>
                    <TD>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          SEVERITY_TONE[e.severity]
                        }`}
                      >
                        {t(SEVERITY_LABEL[e.severity] ?? "severityNote")}
                      </span>
                    </TD>
                    <TD className="text-[color:var(--muted-fg)]">
                      {e.reportedBy.name ?? e.reportedBy.email}
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      </div>
    );
  });
}

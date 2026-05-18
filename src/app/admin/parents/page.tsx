import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { LinkButton } from "@/components/ui/button";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { ParentsSearchBox } from "./_search-box";

const STATUS_KEY: Record<string, string> = {
  ACTIVE: "statusActive",
  INVITED: "statusInvited",
  DISABLED: "statusDisabled",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INVITED: "bg-amber-100 text-amber-800",
  DISABLED: "bg-zinc-200 text-zinc-700",
};

export default async function ParentsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("parents");
    const query = q.trim();

    const parents = await db.user.findMany({
      where: {
        role: "PARENT",
        ...(query
          ? {
              OR: [
                { email: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
                {
                  guardianProfile: {
                    childLinks: {
                      some: {
                        student: {
                          OR: [
                            { firstName: { contains: query, mode: "insensitive" } },
                            { lastName: { contains: query, mode: "insensitive" } },
                          ],
                        },
                      },
                    },
                  },
                },
                {
                  guardianProfile: {
                    relation: { contains: query, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        guardianProfile: {
          select: {
            _count: { select: { childLinks: true } },
            childLinks: {
              select: { student: { select: { firstName: true, lastName: true } } },
              take: 3,
            },
          },
        },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader
            title={t("title")}
            description={t("lead")}
            action={
              <LinkButton href="/admin/parents/new" size="sm">
                + {t("createCta")}
              </LinkButton>
            }
          />

          <div className="max-w-sm">
            <ParentsSearchBox />
          </div>

          <Table>
            <THead>
              <tr>
                <TH>{t("colName")}</TH>
                <TH>{t("colEmail")}</TH>
                <TH className="text-right">{t("colChildren")}</TH>
                <TH>{t("colStatus")}</TH>
                <TH>{t("colCreated")}</TH>
              </tr>
            </THead>
            <tbody>
              {parents.length === 0 ? (
                <EmptyRow colSpan={5}>{query ? t("emptySearch") : t("empty")}</EmptyRow>
              ) : (
                parents.map((p) => {
                  const childPreview = p.guardianProfile?.childLinks
                    .map((l) => `${l.student.firstName} ${l.student.lastName}`)
                    .join(", ");
                  const totalKids = p.guardianProfile?._count.childLinks ?? 0;
                  return (
                  <TR key={p.id}>
                    <TD>
                      <Link
                        href={`/admin/parents/${p.id}`}
                        className="font-medium hover:underline"
                      >
                        {p.name ?? "—"}
                      </Link>
                      {childPreview ? (
                        <div className="mt-0.5 text-xs text-[color:var(--muted-fg)]">
                          {childPreview}
                          {totalKids > (p.guardianProfile?.childLinks.length ?? 0)
                            ? ` +${totalKids - (p.guardianProfile?.childLinks.length ?? 0)}`
                            : ""}
                        </div>
                      ) : null}
                    </TD>
                    <TD className="text-[color:var(--muted-fg)]">{p.email}</TD>
                    <TD className="text-right tabular-nums">{totalKids}</TD>
                    <TD>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_TONE[p.status]
                        }`}
                      >
                        {t(STATUS_KEY[p.status] ?? "statusActive")}
                      </span>
                    </TD>
                    <TD className="text-[color:var(--muted-fg)] tabular-nums">
                      {p.createdAt.toISOString().slice(0, 10)}
                    </TD>
                  </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}

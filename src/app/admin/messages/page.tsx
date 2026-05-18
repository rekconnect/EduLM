import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";

const STATUS_KEY: Record<string, string> = {
  NEW: "statusNew",
  READ: "statusRead",
  CLOSED: "statusClosed",
};

const STATUS_TONE: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  READ: "bg-slate-100 text-slate-700",
  CLOSED: "bg-zinc-200 text-zinc-700",
};

export default async function AdminMessagesPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");

    const messages = await db.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
      },
    });

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-5xl space-y-4 px-6 py-10">
          <PageHeader title={t("messagesTitle")} description={t("messagesAdminLead")} />

          <Table>
            <THead>
              <tr>
                <TH>{t("colFrom")}</TH>
                <TH>{t("colSubject")}</TH>
                <TH>{t("colReceived")}</TH>
                <TH>{t("colStatus")}</TH>
              </tr>
            </THead>
            <tbody>
              {messages.length === 0 ? (
                <EmptyRow colSpan={4}>{t("messagesEmpty")}</EmptyRow>
              ) : (
                messages.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-[color:var(--muted-fg)]">
                      {m.fromUser.name ?? m.fromUser.email}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/messages/${m.id}`}
                        className={`hover:underline ${
                          m.status === "NEW" ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {m.subject}
                      </Link>
                    </TD>
                    <TD className="text-[color:var(--muted-fg)] tabular-nums">
                      {m.createdAt.toISOString().slice(0, 10)}
                    </TD>
                    <TD>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_TONE[m.status]
                        }`}
                      >
                        {t(STATUS_KEY[m.status] ?? "statusNew")}
                      </span>
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </main>
      </AppShell>
    );
  });
}

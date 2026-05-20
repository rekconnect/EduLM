import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { closeMessage, markMessageRead, reopenMessage } from "../_actions";

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

export default async function AdminMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("communication");
    const tCommon = await getTranslations("common");

    const msg = await db.contactMessage.findUnique({
      where: { id },
      include: {
        fromUser: { select: { name: true, email: true } },
      },
    });
    if (!msg) notFound();

    // Auto-mark as READ on first open by admin.
    if (msg.status === "NEW") {
      await db.contactMessage.update({
        where: { id },
        data: { status: "READ", readAt: new Date(), readByUserId: user.id },
      });
      msg.status = "READ";
    }

    const boundClose = closeMessage.bind(null, id);
    const boundReopen = reopenMessage.bind(null, id);
    const boundRead = markMessageRead.bind(null, id);

    return (
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={msg.subject}
            description={`${t("fromLabel")}: ${msg.fromUser.name ?? msg.fromUser.email}`}
            action={
              <Link
                href="/admin/messages"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {t("messagesTitle")}
              </Link>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                STATUS_TONE[msg.status]
              }`}
            >
              {t(STATUS_KEY[msg.status] ?? "statusNew")}
            </span>
            <span className="text-xs text-[color:var(--muted-fg)] tabular-nums">
              {msg.createdAt.toISOString().slice(0, 10)}
            </span>
          </div>

          <Card>
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed">{msg.body}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("replyHint", { email: msg.fromUser.email })} />
            <CardBody className="flex items-center justify-end gap-2">
              {msg.status === "CLOSED" ? (
                <form action={boundReopen}>
                  <Button variant="secondary" size="sm" type="submit">
                    {t("reopenAction")}
                  </Button>
                </form>
              ) : (
                <>
                  <form action={boundRead}>
                    <Button variant="ghost" size="sm" type="submit">
                      {tCommon("save")}
                    </Button>
                  </form>
                  <form action={boundClose}>
                    <Button variant="danger" size="sm" type="submit">
                      {t("closeAction")}
                    </Button>
                  </form>
                </>
              )}
            </CardBody>
          </Card>
        </main>
    );
  });
}

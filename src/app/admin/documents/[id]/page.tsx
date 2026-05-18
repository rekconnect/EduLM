import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { getSignedDownloadUrl } from "@/lib/storage";
import { deleteDocument } from "../_actions";

const CATEGORY_KEY: Record<string, string> = {
  REGULATION: "categoryRegulation",
  CALENDAR: "categoryCalendar",
  FORM: "categoryForm",
  NEWSLETTER: "categoryNewsletter",
  OTHER: "categoryOther",
};

const AUDIENCE_KEY: Record<string, string> = {
  ALL_PARENTS: "audienceAll",
  CLASS: "audienceClass",
  ACADEMIC_YEAR: "audienceYear",
};

export default async function AdminDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const t = await getTranslations("documents");
    const tCommon = await getTranslations("common");

    const doc = await db.tenantDocument.findUnique({
      where: { id },
      include: {
        class: { select: { name: true } },
        academicYear: { select: { label: true } },
        uploadedBy: { select: { name: true, email: true } },
        acknowledgments: {
          orderBy: { acknowledgedAt: "desc" },
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });
    if (!doc) notFound();

    const signedUrl = doc.storagePath ? await getSignedDownloadUrl(doc.storagePath) : null;
    const targetUrl = signedUrl ?? doc.externalUrl ?? null;
    const boundDelete = deleteDocument.bind(null, id);

    // For "ack required" docs, compute progress (parents who acknowledged).
    let totalParents = 0;
    if (doc.requiresAck) {
      // Total eligible parents depends on audience; for MVP we just count all
      // PARENT users in the tenant. Refine later for class/year audiences.
      totalParents = await db.user.count({ where: { role: "PARENT" } });
    }

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email} >
        <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
          <PageHeader
            title={doc.title}
            description={`${t(CATEGORY_KEY[doc.category] ?? "categoryOther")} · ${doc.publishedAt.toISOString().slice(0, 10)}`}
            action={
              <Link
                href="/admin/documents"
                className="text-sm text-[color:var(--muted-fg)] hover:underline"
              >
                ← {t("adminTitle")}
              </Link>
            }
          />

          <Card>
            <CardBody className="space-y-3 text-sm">
              {doc.description ? (
                <p className="whitespace-pre-line">{doc.description}</p>
              ) : null}
              <p className="text-[color:var(--muted-fg)]">
                <span className="font-medium">{t("colAudience")}: </span>
                {doc.audience === "CLASS"
                  ? `${t("audienceClass")} · ${doc.class?.name ?? "—"}`
                  : doc.audience === "ACADEMIC_YEAR"
                    ? `${t("audienceYear")} · ${doc.academicYear?.label ?? "—"}`
                    : t("audienceAll")}
              </p>
              <p className="text-[color:var(--muted-fg)]">
                <span className="font-medium">Uploaded by: </span>
                {doc.uploadedBy.name ?? doc.uploadedBy.email}
              </p>
              <p className="text-[color:var(--muted-fg)]">
                <span className="font-medium">Stockage: </span>
                {doc.storagePath
                  ? `Supabase Storage (${doc.mimeType ?? "—"}, ${doc.fileSizeBytes ? Math.round(doc.fileSizeBytes / 1024) + " KB" : "?"})`
                  : doc.externalUrl
                    ? "External URL"
                    : "—"}
              </p>
              {targetUrl ? (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[color:var(--muted)]"
                >
                  ↓ {doc.storagePath ? t("download") : t("openLink")}
                </a>
              ) : null}
            </CardBody>
          </Card>

          {doc.requiresAck ? (
            <Card>
              <CardHeader
                title={t("ackRequired")}
                description={t("ackProgress", {
                  done: doc.acknowledgments.length,
                  total: totalParents || doc.acknowledgments.length,
                })}
              />
              <CardBody>
                {doc.acknowledgments.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted-fg)]">—</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {doc.acknowledgments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between">
                        <span>{a.user.name ?? a.user.email}</span>
                        <span className="text-xs text-[color:var(--muted-fg)] tabular-nums">
                          {a.acknowledgedAt.toISOString().slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}

          <form action={boundDelete} className="flex justify-end">
            <Button variant="danger" size="sm" type="submit">
              {tCommon("delete")}
            </Button>
          </form>
        </main>
      </AppShell>
    );
  });
}

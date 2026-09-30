import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { hasModule, requireModuleAccess } from "@/lib/permissions";
import { runWithTenant } from "@/lib/tenant-context";
import { isStorageConfigured } from "@/lib/storage";
import { loadPickerOptions, parentDisplayName } from "@/lib/messaging";
import type { AudienceSpec } from "@/lib/messaging-shared";
import { MessageComposer } from "./_composer";

/**
 * Staff composer — /admin/messages/new[?parent=<userId>].
 * `?parent=` prefills one parent (e.g. from a parent's fiche); the id is
 * only honoured if it is a PARENT account of this tenant (scoped db).
 */
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string | string[] }>;
}) {
  const { parent } = await searchParams;
  const { user, access } = await requireModuleAccess("communication", "write");
  const allowAll = hasModule(access, "communication", "full");
  const storageEnabled = isStorageConfigured();
  const parentId =
    typeof parent === "string" && parent.trim() && parent.length <= 200 ? parent.trim() : null;

  return runWithTenant({ tenantId: user.tenantId, slug: null }, async () => {
    const t = await getTranslations("messaging.compose");

    const options = await loadPickerOptions();
    const prefill = parentId
      ? await db.user.findFirst({
          where: { id: parentId, role: "PARENT", deletedAt: null },
          select: { id: true, email: true, name: true, firstName: true, lastName: true },
        })
      : null;

    const initialAudience: AudienceSpec = prefill ? { parentUserIds: [prefill.id] } : {};
    const initialLabels: Record<string, string> = prefill
      ? { [prefill.id]: parentDisplayName(prefill) }
      : {};

    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/admin/messages"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-brand-600)]"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          {t("back")}
        </Link>
        <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
        <MessageComposer
          establishments={options.establishments}
          levels={options.levels}
          classes={options.classes}
          allowAll={allowAll}
          storageEnabled={storageEnabled}
          initialAudience={initialAudience}
          initialLabels={initialLabels}
        />
      </main>
    );
  });
}

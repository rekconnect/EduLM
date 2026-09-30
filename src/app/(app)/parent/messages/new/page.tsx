import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { db } from "@/lib/db";
import { MESSAGE_SUBJECT_MAX } from "@/lib/messaging-shared";
import { withParentSession } from "@/lib/session";
import { NewMessageForm } from "./_form";

/**
 * "Écrire à l'école" — opens a new private conversation with the school.
 * `?about=<threadId>` (from a no-reply or closed conversation) prefills the
 * subject from that thread — looked up pinned to this parent only.
 */
export default async function NewParentMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ about?: string | string[] }>;
}) {
  const { about } = await searchParams;

  return withParentSession(async (user) => {
    const t = await getTranslations("messaging.parent");

    let defaultSubject = "";
    if (typeof about === "string" && about.length > 0 && about.length <= 64) {
      const source = await db.messageThread.findFirst({
        where: { id: about, parentUserId: user.id },
        select: { subject: true },
      });
      if (source) {
        defaultSubject = t("aboutSubject", { subject: source.subject }).slice(
          0,
          MESSAGE_SUBJECT_MAX,
        );
      }
    }

    return (
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href="/parent/messages"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:text-[color:var(--color-foreground)]"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("backToMessages")}
        </Link>

        <PageHeader title={t("newTitle")} description={t("newLead")} />

        <section className="overflow-hidden rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
          <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-5 py-4 sm:px-6">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
              <MessageSquarePlus className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                {t("newCardTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                {t("newCardHint")}
              </p>
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <NewMessageForm defaultSubject={defaultSubject} />
          </div>
        </section>
      </main>
    );
  });
}

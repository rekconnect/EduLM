import { getTranslations } from "next-intl/server";
import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { withParentSession } from "@/lib/session";
import { ContactForm } from "./_form";

export default async function ParentContactPage() {
  return withParentSession(async (user) => {
    const t = await getTranslations("communication");

    return (
      <AppShell role={user.role} userLabel={user.name ?? user.email}>
        <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
          <PageHeader title={t("contactTitle")} description={t("contactLead")} />

          <div className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
            <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <MessageSquare className="size-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                  {t("contactTitle")}
                </h2>
                <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                  {t("contactLead")}
                </p>
              </div>
            </div>
            <div className="p-6">
              <ContactForm />
            </div>
          </div>
        </main>
      </AppShell>
    );
  });
}

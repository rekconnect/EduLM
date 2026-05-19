import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";
import { AppearancePicker } from "./_appearance";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");

  let tenantName = "";
  if (user.tenantId) {
    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });
    tenantName = tenant?.name ?? "";
  }

  return (
    <AppShell role={user.role} userLabel={user.name ?? user.email} tenantLabel={tenantName}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader title={t("title")} description={t("description")} />

        <section className="mt-2 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-6 shadow-card">
          <header className="mb-4">
            <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
              {t("appearance.title")}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
              {t("appearance.description")}
            </p>
          </header>
          <AppearancePicker />
        </section>
      </main>
    </AppShell>
  );
}

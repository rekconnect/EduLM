import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ExternalLink,
  History,
  Pencil,
  Settings2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { InscriptionTabsForm } from "./_tabs-form";
import { loadInscriptionTabsConfig } from "./_actions";

/**
 * Admin landing page for inscription form customization. Today it
 * surfaces:
 *   1. Per-tab visibility toggles (10 tabs).
 *   2. Pointers to the existing flat field-config editors at
 *      /settings → Forms for tenant custom fields on Élève and
 *      Responsables tabs.
 *   3. A roadmap card for the upcoming WYSIWYG inline editor
 *      (Phase 5 v2) that will let admin rename + reorder built-in
 *      fields and add show-if rules directly on the form.
 */
export default async function InscriptionConfigPage() {
  await requireRole("SCHOOL_ADMIN");
  const [t, tabsConfig] = await Promise.all([
    getTranslations("inscriptionConfig"),
    loadInscriptionTabsConfig(),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <PageHeader title={t("title")} description={t("description")} />

      <InscriptionTabsForm initial={tabsConfig} />

      <Card>
        <CardHeader
          title={t("customFields.title")}
          description={t("customFields.description")}
        />
        <CardBody className="space-y-2">
          <Link
            href="/settings?tab=forms"
            className="group flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-4 py-3 transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-sunken)]"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Settings2 className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                  {t("customFields.linkLabel")}
                </span>
                <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                  {t("customFields.linkHint")}
                </span>
              </span>
            </span>
            <ExternalLink className="size-4 text-[color:var(--color-foreground-subtle)]" aria-hidden />
          </Link>
        </CardBody>
      </Card>

      {/* WYSIWYG preview / inline editor — currently covers the Élève
          tab; other tabs land in Phase 4. */}
      <Card>
        <CardHeader
          title="Personnaliser les libellés (aperçu)"
          description="Modifiez les libellés, le caractère obligatoire ou masquez n'importe quel champ du formulaire d'inscription. Aperçu de l'onglet Élève — les onglets restants suivent."
        />
        <CardBody className="space-y-2">
          <Link
            href="/admin/inscription-config/preview"
            className="group flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-4 py-3 transition-colors hover:border-[color:var(--color-brand-500)] hover:bg-[color:var(--color-surface-sunken)]"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Pencil className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                  Ouvrir l&apos;éditeur WYSIWYG
                  <Sparkles className="ms-1 inline size-3 text-[color:var(--color-brand-600)]" aria-hidden />
                </span>
                <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                  Survolez un champ → cliquez sur le crayon pour le modifier
                </span>
              </span>
            </span>
            <ExternalLink className="size-4 text-[color:var(--color-foreground-subtle)]" aria-hidden />
          </Link>

          <Link
            href="/admin/inscription-config/overrides"
            className="group flex items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-4 py-3 transition-colors hover:border-[color:var(--color-brand-500)] hover:bg-[color:var(--color-surface-sunken)]"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <History className="size-4" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-medium text-[color:var(--color-foreground)] group-hover:text-[color:var(--color-brand-600)]">
                  Voir les personnalisations actives
                </span>
                <span className="block text-xs text-[color:var(--color-foreground-muted)]">
                  Liste des champs modifiés, historique des changements, réinitialisation par champ
                </span>
              </span>
            </span>
            <ExternalLink className="size-4 text-[color:var(--color-foreground-subtle)]" aria-hidden />
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}

import Link from "next/link";
import { getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  parseTenantInscriptionFormConfig,
  type DossierLocale,
} from "@/lib/inscription-fields-resolver";
import { PreviewClient } from "./_client";

/**
 * WYSIWYG preview / editor route. Renders the parent Élève tab against
 * realistic mock data so a school admin can hover any field and edit
 * its label / required / hidden state via the right-side drawer.
 *
 * Phase 3 — Élève only. Phase 4 will replicate the same pencil overlay
 * across the other 9 tabs once the API has been proven against this one.
 */
export default async function InscriptionConfigPreviewPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const [tenant, localeStr] = await Promise.all([
    unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, inscriptionFormConfig: true },
    }),
    getLocale(),
  ]);
  if (!tenant) return null;

  const inscriptionFormConfig = parseTenantInscriptionFormConfig(
    tenant.inscriptionFormConfig,
  );
  const dossierLocale: DossierLocale =
    localeStr === "en" || localeStr === "ar" ? localeStr : "fr";

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <PageHeader
        title="Personnaliser le formulaire d'inscription"
        description="Survolez n'importe quel champ et cliquez sur le crayon pour modifier son libellé, son caractère obligatoire ou le masquer."
        action={
          <Link
            href="/admin/inscription-config"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Configuration
          </Link>
        }
      />

      {/* Subtle banner pointing admin at the hover affordance — useful
          on first visit. Auto-fades by being unobtrusive; no JS state. */}
      <div className="rounded-lg border border-dashed border-[color:var(--color-brand-500)]/40 bg-[color:var(--color-brand-50)] px-4 py-3 text-sm text-[color:var(--color-brand-700)]">
        <p>
          Aperçu interactif des 9 onglets du dossier. Survolez un champ et
          cliquez sur le crayon pour modifier son libellé, son caractère
          obligatoire ou le masquer. Les modifications sont enregistrées
          immédiatement et s&apos;appliquent à tous les dossiers parents en cours.
        </p>
      </div>

      <PreviewClient
        inscriptionFormConfig={inscriptionFormConfig}
        locale={dossierLocale}
        schoolName={tenant.name}
      />
    </main>
  );
}

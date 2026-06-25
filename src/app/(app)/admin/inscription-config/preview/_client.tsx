"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { TenantConfigProvider } from "@/components/dossier/tenant-config-context";
import { PreviewEditModeProvider } from "@/components/dossier/preview-edit-mode-context";
import { FieldEditDrawer } from "@/components/dossier/field-edit-drawer";
import { FirstTimeBanner } from "./_first-time-banner";
import { DossierTabScolarite } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-scolarite";
import { DossierTabFinance } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-finance";
import { DossierTabValidation } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-validation";
import {
  defaultFinance,
} from "@/lib/dossier-content";
import { defaultPedagogique } from "@/lib/pedagogique";
import {
  type DossierLocale,
  type TenantInscriptionFormConfig,
} from "@/lib/inscription-fields-resolver";

type PreviewTabKey =
  | "eleve"
  | "responsables"
  | "foyer"
  | "scolarite"
  | "transport"
  | "contacts"
  | "sante"
  | "finance"
  | "validation";

const TAB_LABELS: Record<PreviewTabKey, string> = {
  eleve: "Élève",
  responsables: "Responsables",
  foyer: "Foyer",
  scolarite: "Scolarité",
  transport: "Transport",
  contacts: "Contacts",
  sante: "Santé",
  finance: "Finance",
  validation: "Validation",
};

// ── Mock data — one realistic dossier-in-progress for all tabs ──
// Maya Hajj, 17 years old, Terminale. Picked so the Scolarité
// preview shows the Pédagogique Terminale block (the richest one).
// Admin can change the niveau interactively to see other groups.

const MOCK_SCOLARITE = {
  previousSchool: "Lycée Abdel Kader",
  previousClass: "1ère S",
  previousNetwork: "autre",
  attendedMlfBefore: false as boolean | null,
  history: [],
  ebepPrevious: false as boolean | null,
  ebepPreviousFlags: {
    PAI: false,
    PAP: false,
    PPS: false,
    PPRE: false,
    AESH: false,
  },
  ebepCurrent: false as boolean | null,
  ebepCurrentFlags: {
    PAI: false,
    PAP: false,
    PPS: false,
    PPRE: false,
    AESH: false,
  },
  bilansRealises: {
    orthophonique: false,
    psychologique: false,
    psychomoteur: false,
    psychoPediatrique: false,
  },
  dispenseLibanais: "non" as const,
  entryDate: "2026-09-01",
  section: "",
};

export function PreviewClient({
  inscriptionFormConfig,
  locale,
  schoolName,
}: {
  inscriptionFormConfig: TenantInscriptionFormConfig;
  locale: DossierLocale;
  schoolName: string;
}) {
  const [active, setActive] = useState<PreviewTabKey>("eleve");

  return (
    <TenantConfigProvider config={inscriptionFormConfig} locale={locale}>
      <PreviewEditModeProvider>
        {/* First-time teaching banner — auto-dismisses on first pencil
            click; persisted via localStorage so it stays dismissed for
            returning admins. */}
        <div className="mb-4">
          <FirstTimeBanner />
        </div>

        {/* Tab nav — local state, no URL change. Mirrors the parent
            dossier's visual but doesn't show REMPLI badges since this
            is mock data. */}
        <nav
          aria-label="Onglets de l'aperçu"
          className="flex flex-wrap gap-1 border-b border-[color:var(--color-border-subtle)] pb-px"
        >
          {(Object.keys(TAB_LABELS) as PreviewTabKey[]).map((tab) => {
            const isActive = tab === active;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActive(tab)}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "relative inline-flex items-center gap-2 rounded-t-md border-b-2 border-[color:var(--color-brand-600)] bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors"
                    : "inline-flex items-center gap-2 rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]"
                }
              >
                {TAB_LABELS[tab]}
                {isActive ? (
                  <Check className="size-3 text-[color:var(--color-brand-600)]" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 space-y-6">
          {active === "eleve" ? (
            <MigratedTabNotice tab="Élève" where="Champs élève" />
          ) : null}

          {active === "responsables" ? (
            <MigratedTabNotice tab="Responsables" where="Champs parent" />
          ) : null}

          {active === "foyer" ? (
            <MigratedTabNotice tab="Foyer" where="Champs élève" />
          ) : null}

          {active === "scolarite" ? (
            <DossierTabScolarite
              applicationId="preview"
              initial={MOCK_SCOLARITE}
              initialEstablishmentId=""
              initialNiveau="Tle"
              initialPedagogique={defaultPedagogique()}
              establishments={[]}
              schoolName={schoolName}
              defaultEntryDate="2026-09-01"
              disabled={false}
              editMode
            />
          ) : null}

          {active === "transport" ? (
            <MigratedTabNotice tab="Transport & restauration" where="Champs élève" />
          ) : null}

          {active === "contacts" ? (
            <MigratedTabNotice tab="Autres contacts" where="Champs élève" />
          ) : null}

          {active === "sante" ? (
            <MigratedTabNotice tab="Santé" where="Champs élève" />
          ) : null}

          {active === "finance" ? (
            <DossierTabFinance
              applicationId="preview"
              initial={defaultFinance()}
              disabled={false}
              editMode
            />
          ) : null}

          {active === "validation" ? (
            <DossierTabValidation
              applicationId="preview"
              acknowledged={false}
              documentsListMarkdown=""
              disabled={false}
              editMode
            />
          ) : null}
        </div>

        <FieldEditDrawer />
      </PreviewEditModeProvider>
    </TenantConfigProvider>
  );
}

/**
 * This tab has been migrated to the Dars entity-fields system, so it's
 * configured in Settings → Champs (with a live WYSIWYG preview + conditions),
 * not in this legacy editor. Shown instead of the stale hardcoded form.
 */
function MigratedTabNotice({ tab, where }: { tab: string; where: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--color-brand-200)] bg-[color:var(--color-brand-50)] p-6 text-center">
      <Sparkles
        className="mx-auto size-6 text-[color:var(--color-brand-600)]"
        aria-hidden
      />
      <h3 className="mt-2 text-sm font-semibold text-[color:var(--color-foreground)]">
        L&apos;onglet « {tab} » se configure désormais ici&nbsp;:
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-[color:var(--color-foreground-muted)]">
        Ce champ a migré vers le nouvel éditeur unifié. Modifiez les libellés,
        l&apos;ordre, les types, la visibilité et les conditions d&apos;affichage
        depuis <strong>Réglages → {where}</strong> — avec un aperçu en direct du
        formulaire.
      </p>
      <Link
        href="/settings"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-600)] px-4 py-2 text-sm font-semibold text-[color:var(--color-foreground-onbrand)] shadow-card transition-colors hover:bg-[color:var(--color-brand-700)]"
      >
        Ouvrir {where}
        <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );
}

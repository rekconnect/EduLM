"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { TenantConfigProvider } from "@/components/dossier/tenant-config-context";
import { PreviewEditModeProvider } from "@/components/dossier/preview-edit-mode-context";
import { FieldEditDrawer } from "@/components/dossier/field-edit-drawer";
import { FirstTimeBanner } from "./_first-time-banner";
import { EleveEtatCivilSection } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-eleve-etat-civil";
import { ElevePassportSection } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-eleve-passport";
import { ResponsableLebaneseSection } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-responsable-lebanese";
import { ResponsableFooter } from "@/app/(app)/parent/inscriptions/[id]/edit/_section-responsable-footer";
import { DossierTabFoyer } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-foyer";
import { DossierTabScolarite } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-scolarite";
import { DossierTabTransport } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-transport";
import { DossierTabContacts } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-contacts";
import { DossierTabSante } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-sante";
import { DossierTabFinance } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-finance";
import { DossierTabValidation } from "@/app/(app)/parent/inscriptions/[id]/edit/_tab-validation";
import {
  defaultSante,
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

const MOCK_ELEVE = {
  childFirstName: "Maya",
  childLastName: "Hajj",
  childDob: "2008-09-15",
  childGender: "FEMALE" as const,
  childPlaceOfBirth: "Beyrouth",
  childBirthCountry: "Liban",
  childFirstNameAr: "مايا",
  childLastNameAr: "الحاج",
};
const MOCK_PASSPORT = {
  childIsLebanese: true as boolean | null,
  childPassportLebanese: "RL 1234567",
  childNationality: "",
  childNationality2: "",
};
const MOCK_RESPONSABLE = {
  submitterRelation: "pere",
  submitterIsLebanese: true as boolean | null,
  submitterPassportLebanese: "RL 7654321",
};
const MOCK_FOYER = {
  addressCaza: "Baabda",
  addressVillage: "Hazmieh",
  addressStreet: "Rue Saint-Joseph 12",
  addressBuilding: "Immeuble Cèdres",
  addressFloor: "3",
  addressDetails: "Digicode 0142",
  addressNotes: "",
  imageRightsSite: true as boolean | null,
  imageRightsBook: true as boolean | null,
  imageRightsSocial: false as boolean | null,
  imageRightsRadio: false as boolean | null,
  siblings: [],
};
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
const MOCK_TRANSPORT = {
  modeAller: "bus" as const,
  modeRetour: "bus" as const,
  hasAlternateAddress: false,
  altCaza: "",
  altVillage: "",
  altStreet: "",
  altBuilding: "",
  altFloor: "",
  altDetails: "",
  altNotes: "",
  collation: true as boolean | null,
  cantine: true as boolean | null,
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
            <>
              <EleveEtatCivilSection
                applicationId="preview"
                initial={MOCK_ELEVE}
                disabled={false}
                editMode
              />
              <ElevePassportSection
                applicationId="preview"
                initial={MOCK_PASSPORT}
                disabled={false}
                editMode
              />
            </>
          ) : null}

          {active === "responsables" ? (
            <>
              <ResponsableLebaneseSection
                applicationId="preview"
                initial={MOCK_RESPONSABLE}
                disabled={false}
                editMode
              />
              <ResponsableFooter
                applicationId="preview"
                initialMonoParental={false}
                disabled={false}
                editMode
              />
            </>
          ) : null}

          {active === "foyer" ? (
            <DossierTabFoyer
              applicationId="preview"
              initial={MOCK_FOYER}
              disabled={false}
              editMode
            />
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
            <DossierTabTransport
              applicationId="preview"
              initial={MOCK_TRANSPORT}
              disabled={false}
              niveau="Tle"
              editMode
            />
          ) : null}

          {active === "contacts" ? (
            <DossierTabContacts
              applicationId="preview"
              initial={[]}
              disabled={false}
              editMode
            />
          ) : null}

          {active === "sante" ? (
            <DossierTabSante
              applicationId="preview"
              initial={defaultSante()}
              disabled={false}
              editMode
            />
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

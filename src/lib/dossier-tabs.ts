/**
 * Source of truth for the 10-tab dossier shell. Phase 1 hardcodes the
 * Montaigne field set here; Phase 5 will replace this with a per-tenant
 * `inscriptionFormConfig` JSON authored via the WYSIWYG admin editor.
 */

export const DOSSIER_TABS = [
  "eleve",
  "responsables",
  "foyer",
  "scolarite",
  "sante",
  "transport",
  "contacts",
  "finance",
  "justificatifs",
  "validation",
] as const;

export type DossierTab = (typeof DOSSIER_TABS)[number];

/** Default tab visibility — Lycée Montaigne hides Santé / Finance /
 * Justificatifs (handled on paper). Other MLF schools can flip them on
 * from /settings. */
export const DEFAULT_TABS_VISIBLE: Record<DossierTab, boolean> = {
  eleve: true,
  responsables: true,
  foyer: true,
  scolarite: true,
  sante: false,
  transport: true,
  contacts: true,
  finance: false,
  justificatifs: false,
  validation: true,
};

export type TabsConfig = Record<DossierTab, boolean>;

/** Merge stored config with defaults. Always returns all 10 keys. */
export function parseTabsConfig(raw: unknown): TabsConfig {
  const out = { ...DEFAULT_TABS_VISIBLE };
  if (raw && typeof raw === "object") {
    for (const tab of DOSSIER_TABS) {
      const v = (raw as Record<string, unknown>)[tab];
      if (typeof v === "boolean") out[tab] = v;
    }
  }
  return out;
}

/** Visible tabs in display order — drives both the tab strip and the
 * Précédent / Suivant navigation. */
export function visibleTabs(config: TabsConfig): DossierTab[] {
  return DOSSIER_TABS.filter((t) => config[t]);
}

/** Per-tab completion derived from required-field presence. The shape
 * matches `Application.tabsCompleted` JSON. */
export type TabsCompleted = Partial<Record<DossierTab, boolean>>;

export function parseTabsCompleted(raw: unknown): TabsCompleted {
  if (!raw || typeof raw !== "object") return {};
  const out: TabsCompleted = {};
  for (const tab of DOSSIER_TABS) {
    const v = (raw as Record<string, unknown>)[tab];
    if (typeof v === "boolean") out[tab] = v;
  }
  return out;
}

/** True when every visible tab is marked complete. Used to enable the
 * "Envoyer le dossier" CTA. */
export function allTabsComplete(
  visibility: TabsConfig,
  completed: TabsCompleted,
): boolean {
  for (const tab of visibleTabs(visibility)) {
    if (!completed[tab]) return false;
  }
  return true;
}

/** Total count of tabs left to fill — drives the "À COMPLÉTER: N" badge
 * top-right of every tab. */
export function tabsRemainingCount(
  visibility: TabsConfig,
  completed: TabsCompleted,
): number {
  return visibleTabs(visibility).filter((t) => !completed[t]).length;
}

/**
 * Dossier "state" — the per-dossier phase that controls the Services category's
 * visibility and the whole dossier's editability. Four states:
 *
 *   open            — everything visible + editable (subject to status).
 *   services_hidden — Services category hidden; the rest is editable.
 *   services_open   — Services editable (even after submission); everything
 *                     else read-only. The "services phase".
 *   readonly        — everything visible, nothing editable (consultation).
 *
 * The effective state for a dossier is its own `Application.dossierState`
 * override, falling back to the tenant default for the context
 * (`Tenant.dossierStateInscription` / `dossierStateRenewal`).
 *
 * The Services category is identified by name ("Services") in the student
 * field config.
 */

export const DOSSIER_STATES = [
  "open",
  "services_hidden",
  "services_open",
  "readonly",
] as const;
export type DossierState = (typeof DOSSIER_STATES)[number];

export const SERVICES_CATEGORY_NAME = "Services";

export function parseDossierState(s: unknown): DossierState | null {
  return typeof s === "string" &&
    (DOSSIER_STATES as readonly string[]).includes(s)
    ? (s as DossierState)
    : null;
}

/** Per-dossier override → tenant default for the context → "open". */
export function resolveDossierState(
  appState: string | null | undefined,
  tenantDefault: string | null | undefined,
): DossierState {
  return parseDossierState(appState) ?? parseDossierState(tenantDefault) ?? "open";
}

/** Is the Services category hidden from the parent in this state? */
export function servicesHiddenInState(state: DossierState): boolean {
  return state === "services_hidden";
}

/**
 * Effective editability of a single field in a given state.
 * `baseEditable` is the status-driven editability (DRAFT/SUBMITTED). The state
 * can override it: "services_open" forces Services editable even after
 * submission and locks the rest; "readonly" locks everything.
 */
export function fieldEditableInState(
  state: DossierState,
  opts: { isService: boolean; baseEditable: boolean },
): boolean {
  switch (state) {
    case "open":
    case "services_hidden":
      return opts.baseEditable;
    case "services_open":
      return opts.isService;
    case "readonly":
      return false;
  }
}

/** Whole-tab editability for a NON-Services tab (Responsables, Foyer, …). */
export function nonServiceTabEditable(
  state: DossierState,
  baseEditable: boolean,
): boolean {
  return fieldEditableInState(state, { isService: false, baseEditable });
}

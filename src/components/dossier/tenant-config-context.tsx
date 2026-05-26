"use client";

/**
 * React context for the parent inscription dossier — exposes the
 * tenant's parsed `inscriptionFormConfig` plus the active locale to
 * every component in the tree via `useField(key)`.
 *
 * Mount `TenantConfigProvider` once, high in the dossier tree (the
 * dossier page layout). Server-side, read `Tenant.inscriptionFormConfig`,
 * pass it through `parseTenantInscriptionFormConfig()` (server-safe),
 * then hand the parsed object + locale down as props.
 *
 * Phase 1 ships the context + hook but DOES NOT thread `useField()`
 * into any component yet. Phase 2 wires it into the Élève tab as the
 * vertical slice that validates the API before replicating across the
 * other 9 tabs.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  resolveField,
  type DossierLocale,
  type ResolvedField,
  type TenantInscriptionFormConfig,
} from "@/lib/inscription-fields-resolver";

type TenantConfigCtx = {
  config: TenantInscriptionFormConfig | null;
  locale: DossierLocale;
};

const TenantConfigContext = createContext<TenantConfigCtx>({
  config: null,
  locale: "fr",
});

export function TenantConfigProvider({
  config,
  locale,
  children,
}: {
  /**
   * Parsed config — pass the result of
   * `parseTenantInscriptionFormConfig(tenant.inscriptionFormConfig)` from
   * the server. Null = no overrides yet (treat as fresh tenant).
   */
  config: TenantInscriptionFormConfig | null;
  locale: DossierLocale;
  children: ReactNode;
}) {
  // useMemo: passing a fresh object on every render would re-fire every
  // useField() in the tree even when nothing changed.
  const value = useMemo<TenantConfigCtx>(
    () => ({ config, locale }),
    [config, locale],
  );
  return (
    <TenantConfigContext.Provider value={value}>
      {children}
    </TenantConfigContext.Provider>
  );
}

/**
 * Resolve a registry key against the active tenant's config + locale.
 *
 * Returns `null` for unregistered keys — components should fall back
 * to their hardcoded label/required so a missing entry never breaks a
 * parent's submission. In dev, a console.warn flags the missing key.
 *
 * Typical use:
 *
 *   const lastName = useField("eleve.etatCivil.lastName");
 *   if (lastName?.hidden) return null;
 *   return <Field label={lastName?.label ?? "Nom"} required={lastName?.required}>...</Field>;
 */
export function useField(key: string): ResolvedField | null {
  const { config, locale } = useContext(TenantConfigContext);
  // No useMemo on resolveField — it's pure and fast enough that wrapping
  // it would cost more than it saves. The provider already memoises ctx.
  return resolveField(key, config, locale);
}

/**
 * Escape hatch — returns the raw context so callers can read multiple
 * fields without paying for repeated context reads. Useful inside a
 * memoised render of a card with 10+ fields.
 */
export function useTenantConfig(): TenantConfigCtx {
  return useContext(TenantConfigContext);
}

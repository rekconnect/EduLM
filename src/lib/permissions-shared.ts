/**
 * Pure, client-safe half of the permissions system: module/level constants,
 * types and predicates. NO server imports here — client components (the
 * /admin/permissions manager, nav) import from this file; server guards
 * live in ./permissions, which re-exports everything below.
 */

export const ADMIN_MODULES = [
  "eleves",
  "facturation",
  "paie",
  "services",
  "infirmerie",
  "rapports",
  "formulaires",
  "admissions",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

export const ACCESS_LEVELS = ["read", "write", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const LEVEL_RANK: Record<AccessLevel, number> = { read: 1, write: 2, full: 3 };

/** FR labels for the management UI + nav — single source of truth. */
export const MODULE_META: Record<
  AdminModule,
  { label: string; description: string }
> = {
  eleves: {
    label: "Élèves, parents & classes",
    description: "Fiches élèves, familles/parents, classes et effectifs.",
  },
  facturation: {
    label: "Facturation & finances",
    description: "Factures, paiements, tableau de bord financier.",
  },
  paie: {
    label: "Paie",
    description: "Employés, bulletins de paie, présences du personnel.",
  },
  services: {
    label: "Transport, cantine & collation",
    description: "Bus (aller/retour, circuits), cantine et collations.",
  },
  infirmerie: {
    label: "Infirmerie",
    description: "Données santé des élèves (PAI, vaccinations, allergies).",
  },
  rapports: {
    label: "Rapports",
    description: "Rapports et exports (effectifs, listes, statistiques).",
  },
  formulaires: {
    label: "Formulaires d'inscription",
    description:
      "Configuration des champs et formulaires (inscription / réinscription).",
  },
  admissions: {
    label: "Admissions, campagnes & années",
    description:
      "Dossiers d'admission, création de campagnes et d'années scolaires, classes par niveau.",
  },
};

export const LEVEL_META: Record<AccessLevel, { label: string }> = {
  read: { label: "Lecture" },
  write: { label: "Modification" },
  full: { label: "Accès complet" },
};

export type ModuleGrants = Partial<Record<AdminModule, AccessLevel>>;

export type AdminAccess =
  | { all: true; grants: null }
  | { all: false; grants: ModuleGrants };

export const FULL_ACCESS: AdminAccess = { all: true, grants: null };
export const NO_ACCESS: AdminAccess = { all: false, grants: {} };

/** Parse an AdminGrant.modules JSON blob — unknown modules/levels dropped. */
export function parseModuleGrants(raw: unknown): ModuleGrants {
  const out: ModuleGrants = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (ADMIN_MODULES as readonly string[]).includes(k) &&
      typeof v === "string" &&
      (ACCESS_LEVELS as readonly string[]).includes(v)
    ) {
      out[k as AdminModule] = v as AccessLevel;
    }
  }
  return out;
}

/** The level this access holds on a module, or null. */
export function moduleLevel(
  access: AdminAccess,
  module: AdminModule,
): AccessLevel | null {
  if (access.all) return "full";
  return access.grants[module] ?? null;
}

/** True when the access covers `module` at `min` level or better. */
export function hasModule(
  access: AdminAccess,
  module: AdminModule,
  min: AccessLevel = "read",
): boolean {
  const lvl = moduleLevel(access, module);
  return lvl !== null && LEVEL_RANK[lvl] >= LEVEL_RANK[min];
}

/** True when the access covers at least one module (any level). */
export function hasAnyModule(access: AdminAccess): boolean {
  return access.all || Object.keys(access.grants).length > 0;
}

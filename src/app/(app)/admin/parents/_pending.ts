import type { Prisma } from "@prisma/client";

/**
 * Shared "pending vs confirmed" split for the admin Parents console (and the
 * Admissions list, which shows pending accounts next to the dossiers).
 *
 * A PARENT account is CONFIRMED when the school — or a source the school
 * trusts — vouches for it:
 *  - imported from Dars (`darsParentId`);
 *  - at least one child linked to it (StudentGuardian: created when a dossier
 *    is accepted or when an admin links a child by hand);
 *  - it belongs to a family that already has a student or another linked
 *    guardian. The acceptance bridge links only the dossier's submitter, so
 *    the second responsable of a family sign-up is confirmed THROUGH the
 *    family, not through a child link of its own;
 *  - it is a staff identity: a double-profil hat (`staffRole`) or a Microsoft
 *    directory sign-in (the school directory vouched for the address).
 * Everything else is PENDING: a public self-sign-up whose dossier has not been
 * accepted yet, or an admin-created account with no child yet.
 *
 * The list page (tabs + counts) and the hard-delete path must agree on this
 * definition, so it lives here. PENDING must stay the exact inverse of
 * CONFIRMED for live rows — edit both together.
 */
const MICROSOFT_PROVIDER = "microsoft-entra-id";

export const CONFIRMED_PARENT_WHERE = {
  OR: [
    { darsParentId: { not: null } },
    { staffRole: { not: null } },
    { accounts: { some: { provider: MICROSOFT_PROVIDER } } },
    { guardianProfile: { childLinks: { some: {} } } },
    { guardianProfile: { family: { students: { some: {} } } } },
    { guardianProfile: { family: { guardians: { some: { childLinks: { some: {} } } } } } },
  ],
} satisfies Prisma.UserWhereInput;

/** Pending = live PARENT account that is NOT confirmed (inverse of the above). */
export const PENDING_PARENT_WHERE = {
  role: "PARENT",
  archived: false,
  deletedAt: null,
  darsParentId: null,
  staffRole: null,
  accounts: { none: { provider: MICROSOFT_PROVIDER } },
  OR: [
    { guardianProfile: null },
    {
      guardianProfile: {
        childLinks: { none: {} },
        OR: [
          { family: null },
          {
            family: {
              students: { none: {} },
              guardians: { every: { childLinks: { none: {} } } },
            },
          },
        ],
      },
    },
  ],
} satisfies Prisma.UserWhereInput;

/** Active tab = live PARENT account that IS confirmed. */
export const ACTIVE_PARENT_WHERE = {
  role: "PARENT",
  archived: false,
  deletedAt: null,
  ...CONFIRMED_PARENT_WHERE,
} satisfies Prisma.UserWhereInput;

// ── Views shared with /admissions-admin ─────────────────────────────────────
// Admissions lists DOSSIERS, so an account only shows up there once a dossier
// exists. The two predicates below surface what a dossier list cannot: the
// families that registered and stopped there, and the submitters whose address
// nobody confirmed.

/**
 * A dossier the school still sees in Admissions (active or archived tab). One
 * in the trash no longer counts as "this family has a dossier".
 */
const LIVE_DOSSIER = { deletedAt: null } satisfies Prisma.ApplicationWhereInput;

/**
 * Pending account whose FAMILY has no live dossier: a public sign-up that
 * never started an application (or whose only dossiers were deleted), or an
 * account the school created with no child yet. This is the step before
 * "Brouillon" in the admissions pipeline.
 *
 * Family-aware on purpose: a dossier belongs to its submitter, so the second
 * responsable of a family sign-up owns none while the family's dossier is in
 * progress — that account must not be listed as "without a dossier".
 */
export const PENDING_WITHOUT_DOSSIER_WHERE = {
  AND: [
    PENDING_PARENT_WHERE,
    { submittedApps: { none: LIVE_DOSSIER } },
    {
      NOT: {
        guardianProfile: {
          family: {
            guardians: {
              some: { user: { submittedApps: { some: LIVE_DOSSIER } } },
            },
          },
        },
      },
    },
  ],
} satisfies Prisma.UserWhereInput;

/**
 * Pending account whose e-mail address was never confirmed (`emailVerified`
 * stays null on a public sign-up until the address is verified). Restricted
 * to PENDING accounts: once the school has linked a child, it vouches for the
 * family and the flag is no longer a signal — imported and admin-created
 * parents would otherwise all carry it.
 */
export const UNVERIFIED_PENDING_PARENT_WHERE = {
  ...PENDING_PARENT_WHERE,
  emailVerified: null,
} satisfies Prisma.UserWhereInput;

/**
 * What the automatic purge (src/lib/signup-retention.ts) is allowed to delete:
 * a pending account that registered ITSELF through the public form and whose
 * family never started a dossier — no dossier in ANY state, trash included.
 *
 *  - `emailVerified: null` is the "public form" marker: the form leaves it
 *    null, whereas an account the school creates in the Parents console gets a
 *    date. The school's own creations are therefore never purged.
 *  - "no dossier at all" is stricter than PENDING_WITHOUT_DOSSIER_WHERE, which
 *    ignores trashed dossiers: purging an account also removes its drafts, and
 *    a dossier sitting in the trash is still restorable — that decision stays
 *    with a human.
 *  - a DISABLED account is spared: disabling is how the school blocks an
 *    address, and deleting the row would free that address for a new sign-up.
 *
 * When verification by e-mail ships, confirmed sign-ups will carry a date and
 * drop out of this predicate; decide then whether they need their own rule.
 */
export const ABANDONED_SIGNUP_WHERE = {
  AND: [
    PENDING_PARENT_WHERE,
    { emailVerified: null },
    { status: { not: "DISABLED" } },
    { submittedApps: { none: {} } },
    {
      NOT: {
        guardianProfile: {
          family: {
            guardians: { some: { user: { submittedApps: { some: {} } } } },
          },
        },
      },
    },
  ],
} satisfies Prisma.UserWhereInput;

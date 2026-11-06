import type { Prisma } from "@prisma/client";

/**
 * Shared "pending vs confirmed" split for the admin Parents console.
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

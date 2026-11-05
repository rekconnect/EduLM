import type { Prisma } from "@prisma/client";

/**
 * Shared "pending vs confirmed" split for the admin Parents console.
 *
 * A PARENT account is CONFIRMED only when the school vouches for it: it was
 * imported from Dars (`darsParentId`) or it has at least one child linked (a
 * StudentGuardian row is created when a dossier is accepted or when an admin
 * links a child by hand). Everything else is PENDING: a public self-sign-up
 * whose dossier has not been accepted yet, or an admin-created account that
 * has no child yet.
 *
 * Both the list page (tabs + counts) and the purge action must agree on this
 * definition, so it lives here rather than inline in either file.
 */
export const CONFIRMED_PARENT_WHERE = {
  OR: [
    { darsParentId: { not: null } },
    { guardianProfile: { childLinks: { some: {} } } },
  ],
} satisfies Prisma.UserWhereInput;

/** Pending = live PARENT account that is NOT confirmed. */
export const PENDING_PARENT_WHERE = {
  role: "PARENT",
  archived: false,
  deletedAt: null,
  darsParentId: null,
  OR: [
    { guardianProfile: null },
    { guardianProfile: { childLinks: { none: {} } } },
  ],
} satisfies Prisma.UserWhereInput;

/** Active tab = live PARENT account that IS confirmed (inverse of pending). */
export const ACTIVE_PARENT_WHERE = {
  role: "PARENT",
  archived: false,
  deletedAt: null,
  ...CONFIRMED_PARENT_WHERE,
} satisfies Prisma.UserWhereInput;

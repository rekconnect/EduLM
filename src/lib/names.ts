/**
 * Name helpers for the User model.
 *
 * Round 3 split `User.name` into separate `firstName` + `lastName` columns.
 * The legacy `name` field is kept populated as the concatenation (for NextAuth
 * session compatibility), but reads should prefer the split fields when set
 * and only fall back to splitting `name` on the first space for records
 * created before the migration.
 */

/** Combine first + last into the legacy `name` string. Trims both. */
export function joinName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

/**
 * Split a legacy `name` string into firstName + lastName. Best-effort: splits
 * on the first whitespace. Single-token names become firstName with empty
 * lastName so forms can still pre-fill.
 */
export function splitLegacyName(
  name: string | null | undefined,
): { firstName: string; lastName: string } {
  if (!name) return { firstName: "", lastName: "" };
  const trimmed = name.trim();
  if (trimmed === "") return { firstName: "", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

/**
 * Pick the best display name for a User. Prefers `firstName lastName` when
 * either split field is set; otherwise falls back to the legacy `name`, then
 * the email. Always returns a non-empty string.
 */
export function displayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  if (user.firstName || user.lastName) {
    return joinName(user.firstName ?? "", user.lastName ?? "");
  }
  return user.name ?? user.email ?? "";
}

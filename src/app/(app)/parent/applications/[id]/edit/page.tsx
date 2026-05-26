import { redirect } from "next/navigation";

/**
 * Legacy 3-step wizard route (Identité → Famille → Antécédents → Revue).
 * Superseded by the 10-tab Eduka-style dossier shell at
 * /parent/inscriptions/{id}/edit. This file exists only to catch
 * stale bookmarks and redirect them — the new shell handles every
 * editable status (DRAFT, SUBMITTED) and the read-only detail view
 * at /parent/applications/{id} handles the rest.
 */
export default async function LegacyEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/parent/inscriptions/${id}/edit`);
}

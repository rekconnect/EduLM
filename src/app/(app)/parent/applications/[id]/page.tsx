import { redirect } from "next/navigation";

/**
 * Legacy parent-facing read-only detail view. All statuses now route to
 * the 10-tab dossier shell at /parent/inscriptions/{id}/edit — it
 * handles editable + read-only modes via the `disabled` prop on each
 * tab section. Keeping the parent on the same UI across the dossier
 * lifecycle (DRAFT → SUBMITTED → UNDER_REVIEW → INTERVIEW_SCHEDULED →
 * ACCEPTED/DECLINED) means no jarring UI shift when admin advances
 * the application.
 *
 * This file exists only to catch stale bookmarks / direct visits and
 * redirect them. The 10-tab shell sets editable = status IN
 * (DRAFT, SUBMITTED) and disables every input otherwise.
 */
export default async function LegacyParentApplicationDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/parent/inscriptions/${id}/edit`);
}

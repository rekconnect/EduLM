import { redirect } from "next/navigation";

/**
 * Legacy create-application route. The Eduka-style 2-card create flow
 * lives at /parent/inscriptions/new now — this file exists only to
 * catch stale bookmarks / direct visits and redirect them. The old
 * `startApplication` server action in ../_actions.ts is kept for now
 * as dead code; safe to remove once we're confident nothing imports it.
 */
export default function LegacyNewApplicationRedirect() {
  redirect("/parent/inscriptions/new");
}

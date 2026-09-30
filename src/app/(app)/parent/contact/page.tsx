import { redirect } from "next/navigation";

/**
 * Legacy "Contacter l'école" route. The one-way contact form was replaced by
 * the two-way messagerie — this file only keeps old links and bookmarks
 * working by sending them to the new-message composer.
 */
export default function LegacyParentContactRedirect() {
  redirect("/parent/messages/new");
}

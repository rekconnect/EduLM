"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm";
import { resetFieldOverride } from "../_field-override-actions";

/**
 * Per-row "Réinitialiser" button on the overrides listing page.
 * Drops the override for a single field key and refreshes the page so
 * the row disappears from the active-overrides table.
 *
 * Uses the shared themed confirm() dialog — same UX as the drawer's reset
 * button to keep the two flows consistent.
 */
export function ResetOverrideButton({
  fieldKey,
  label,
}: {
  fieldKey: string;
  /** Human-readable field label shown in the confirm prompt. */
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  async function onClick() {
    const confirmed = await confirm({
      title: `Réinitialiser « ${label} » à sa valeur par défaut ?`,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const r = await resetFieldOverride(fieldKey);
      if (r.ok) {
        toast.success("Champ réinitialisé");
        router.refresh();
      } else {
        toast.error(`Erreur : ${r.error ?? "inconnue"}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={`Réinitialiser ${fieldKey}`}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-[color:var(--color-danger)] transition-colors hover:bg-[color:var(--color-danger-soft)] disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <RotateCcw className="size-3.5" aria-hidden />
      )}
      Réinitialiser
    </button>
  );
}

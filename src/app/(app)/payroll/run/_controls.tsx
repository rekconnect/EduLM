"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { generateMonth, setMonthPublished } from "./_actions";

export function GenerateButton({ year, month, hasData }: { year: number; month: number; hasData: boolean }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (hasData) {
          const ok = await confirm({
            title: "Régénérer les bulletins ?",
            description: "Les bulletins générés de ce mois seront recalculés avec les règles actuelles. L'historique Dars n'est pas touché.",
            confirmLabel: "Régénérer",
          });
          if (!ok) return;
        }
        start(() => void generateMonth(year, month));
      }}
    >
      {pending ? "…" : hasData ? "Régénérer" : "Générer"}
    </Button>
  );
}

export function PublishToggle({ year, month, published }: { year: number; month: number; published: boolean }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={published ? "secondary" : "primary"}
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: published ? "Masquer aux employés ?" : "Publier aux employés ?",
          description: published
            ? "Les bulletins de ce mois ne seront plus visibles par le personnel."
            : "Les bulletins générés de ce mois deviendront visibles par le personnel dans leur portail.",
          confirmLabel: published ? "Masquer" : "Publier",
        });
        if (ok) start(() => void setMonthPublished(year, month, !published));
      }}
    >
      {pending ? "…" : published ? "Dépublier" : "Publier"}
    </Button>
  );
}

"use client";

import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { deleteEmployee } from "../../_actions";

export function DeleteEmployeeButton({ id, name }: { id: string; name: string }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Supprimer l'employé ?",
          description: `${name} et tous ses bulletins de paie seront supprimés définitivement.`,
          confirmLabel: "Supprimer",
          destructive: true,
        });
        if (ok) start(() => void deleteEmployee(id));
      }}
    >
      Supprimer
    </Button>
  );
}

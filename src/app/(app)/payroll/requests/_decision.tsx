"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { financeDecision, undoDecision, forwardStrandedRequest } from "./_actions";

export function FinanceDecision({ id }: { id: string }) {
  const t = useTranslations("staff");
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <form
        action={(fd) =>
          start(async () => {
            await financeDecision(id, "reject", fd);
          })
        }
        className="space-y-2"
      >
        <Textarea name="note" rows={2} placeholder={t("rejectReason")} className="text-sm" />
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(false)}>
            {t("back")}
          </Button>
          <Button type="submit" size="sm" variant="danger" disabled={pending}>
            {t("reject")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={pending}>
        {t("reject")}
      </Button>
      <Button
        size="sm"
        onClick={() =>
          start(async () => {
            await financeDecision(id, "approve");
          })
        }
        disabled={pending}
      >
        {t("approve")}
      </Button>
    </div>
  );
}

export function ForwardStrandedButton({ id }: { id: string }) {
  const t = useTranslations("staff");
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await forwardStrandedRequest(id);
        })
      }
    >
      {t("forwardToFinance")}
    </Button>
  );
}

export function UndoButton({ id }: { id: string }) {
  const t = useTranslations("staff");
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({ title: t("undoConfirmTitle"), confirmLabel: t("undo") });
        if (ok) start(() => void undoDecision(id));
      }}
    >
      {t("undo")}
    </Button>
  );
}

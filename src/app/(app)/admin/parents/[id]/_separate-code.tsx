"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { separateParentFamilyCode } from "../_actions";

/**
 * Takes the parent out of the family code they sit under and gives them a new
 * one of their own — the way back when a link placed a parent under the wrong
 * family. Asks first: it changes which family this parent is shown with.
 */
export function SeparateFamilyCodeButton({
  parentId,
  code,
}: {
  parentId: string;
  /** The family code the parent is under today. */
  code: string;
}) {
  const t = useTranslations("parents");
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    if (!window.confirm(t("separateCodeConfirm", { code }))) return;
    startTransition(async () => {
      let result: { ok: boolean; code?: string; error?: string };
      try {
        result = await separateParentFamilyCode(parentId);
      } catch {
        result = { ok: false };
      }
      if (result.ok) {
        toast.success(t("separateCodeDone", { code: result.code ?? "" }));
      } else {
        toast.error(
          result.error === "open-dossier"
            ? t("separateCodeOpenDossier")
            : t("separateCodeError"),
          { duration: 10000 },
        );
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={onClick}
      className="gap-2"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {t("separateCodeAction")}
    </Button>
  );
}

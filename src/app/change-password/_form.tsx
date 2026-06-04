"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { changePassword, type ChangePwState } from "./_action";

const ERRORS: Record<string, string> = {
  tooShort: "Le mot de passe doit contenir au moins 8 caractères.",
  mismatch: "Les deux mots de passe ne correspondent pas.",
  sameAsOld: "Choisissez un mot de passe différent du mot de passe initial.",
};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ChangePwState, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <Field label="Nouveau mot de passe" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirmer le mot de passe" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>

      {state.error ? (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert">
          {ERRORS[state.error] ?? "Une erreur est survenue."}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full gap-2">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Enregistrement…" : "Définir mon mot de passe"}
      </Button>
    </form>
  );
}

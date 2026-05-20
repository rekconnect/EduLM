"use client";

import { useTransition, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { recordPayment } from "../_actions";

export function RecordPaymentForm({
  invoiceId,
  defaultAmount,
  currency,
}: {
  invoiceId: string;
  defaultAmount: string;
  currency: string;
}) {
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          + {t("recordPaymentTitle")}
        </Button>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await recordPayment(invoiceId, fd);
      setOpen(false);
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-md border border-[color:var(--border)] bg-[color:var(--muted)] p-4"
    >
      <h3 className="text-sm font-semibold">{t("recordPaymentTitle")}</h3>
      <FormRow>
        <Field label={`${t("paymentAmount")} (${currency})`} htmlFor="amount" required>
          <Input
            id="amount"
            name="amount"
            defaultValue={defaultAmount}
            inputMode="decimal"
            required
            autoFocus
          />
        </Field>
        <Field label={t("paymentMethod")} htmlFor="method" required>
          <Select id="method" name="method" defaultValue="BANK_TRANSFER">
            <option value="CASH">{t("methodCash")}</option>
            <option value="BANK_TRANSFER">{t("methodBankTransfer")}</option>
            <option value="CHEQUE">{t("methodCheque")}</option>
            <option value="CARD">{t("methodCard")}</option>
            <option value="OTHER">{t("methodOther")}</option>
          </Select>
        </Field>
      </FormRow>
      <FormRow>
        <Field label={t("paymentDate")} htmlFor="paidAt">
          <Input
            id="paidAt"
            name="paidAt"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label={t("paymentReference")} htmlFor="reference">
          <Input id="reference" name="reference" />
        </Field>
      </FormRow>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

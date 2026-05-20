"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field, FormRow } from "@/components/ui/field";
import { createInvoice, type InvoiceFormState } from "../_actions";
import { decimalStringToCents, formatMoney } from "@/lib/money";

export type StudentOption = { id: string; firstName: string; lastName: string };

type LineRow = { description: string; amount: string; quantity: string };

const newLine = (): LineRow => ({ description: "", amount: "", quantity: "1" });

export function InvoiceForm({
  students,
  defaultNumber,
  defaultCurrency,
}: {
  students: StudentOption[];
  defaultNumber: string;
  defaultCurrency: string;
}) {
  const t = useTranslations("billing");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState<InvoiceFormState, FormData>(
    createInvoice,
    {},
  );
  const [lines, setLines] = useState<LineRow[]>([newLine()]);
  const [currency, setCurrency] = useState(defaultCurrency);

  const totalCents = lines.reduce((acc, l) => {
    const cents = decimalStringToCents(l.amount) ?? 0;
    const qty = parseInt(l.quantity || "1", 10) || 1;
    return acc + cents * qty;
  }, 0);

  function setLine(i: number, patch: Partial<LineRow>) {
    setLines((cur) => cur.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormRow>
        <Field
          label={t("fieldStudent")}
          htmlFor="studentId"
          required
          error={state.errors?.studentId}
        >
          <Select id="studentId" name="studentId" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.lastName} {s.firstName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("fieldNumber")} htmlFor="number" required error={state.errors?.number}>
          <Input id="number" name="number" defaultValue={defaultNumber} required />
        </Field>
      </FormRow>

      <FormRow>
        <Field label={t("fieldDueDate")} htmlFor="dueDate" error={state.errors?.dueDate}>
          <Input id="dueDate" name="dueDate" type="date" />
        </Field>
        <Field label={t("fieldCurrency")} htmlFor="currency" error={state.errors?.currency}>
          <Select
            id="currency"
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="LBP">LBP</option>
          </Select>
        </Field>
      </FormRow>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{t("fieldLines")}</label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((cur) => [...cur, newLine()])}
          >
            + {t("addLine")}
          </Button>
        </div>
        <div className="space-y-2">
          {lines.map((row, i) => (
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-7">
                <Input
                  name={`line[${i}][description]`}
                  value={row.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  placeholder={t("lineDescription")}
                  required
                />
              </div>
              <div className="col-span-2">
                <Input
                  name={`line[${i}][amount]`}
                  value={row.amount}
                  onChange={(e) => setLine(i, { amount: e.target.value })}
                  placeholder={t("lineAmount")}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="col-span-2">
                <Input
                  name={`line[${i}][quantity]`}
                  value={row.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                  placeholder={t("lineQuantity")}
                  type="number"
                  min="1"
                  step="1"
                />
              </div>
              <div className="col-span-1">
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLines((cur) => cur.filter((_, idx) => idx !== i))
                    }
                    aria-label={t("removeLine")}
                  >
                    ✕
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {state.errors?.lines ? (
          <p className="text-xs text-red-600">{state.errors.lines}</p>
        ) : null}
        <div className="flex justify-end pt-2 text-right">
          <div className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm">
            <span className="text-[color:var(--muted-fg)]">{t("total")}: </span>
            <span className="font-semibold tabular-nums">
              {formatMoney(totalCents, currency)}
            </span>
          </div>
        </div>
      </div>

      <Field label={t("fieldNotes")} htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} />
      </Field>

      <input type="hidden" name="status" value="DRAFT" />

      {state.formError ? (
        <p className="text-sm text-red-600" role="alert">
          {state.formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href="/billing"
          className="inline-flex items-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--muted)]"
        >
          {tCommon("cancel")}
        </a>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("loading") : tCommon("create")}
        </Button>
      </div>
    </form>
  );
}

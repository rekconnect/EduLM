"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateBillingDefaults } from "./_actions";

const CURRENCIES = [
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "MAD", label: "MAD — Moroccan Dirham" },
  { code: "TND", label: "TND — Tunisian Dinar" },
  { code: "DZD", label: "DZD — Algerian Dinar" },
  { code: "EGP", label: "EGP — Egyptian Pound" },
  { code: "LBP", label: "LBP — Lebanese Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
] as const;

const PADDING_OPTIONS = [0, 3, 4, 5, 6, 7, 8];

export function BillingDefaultsForm({
  initial,
}: {
  initial: {
    defaultCurrency: string;
    defaultInvoiceDueOffsetDays: number;
    invoiceFooterText: string | null;
    invoiceNumberPrefix: string | null;
    invoiceNumberPadding: number;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState(initial.defaultCurrency);
  const [dueOffset, setDueOffset] = useState(
    String(initial.defaultInvoiceDueOffsetDays),
  );
  const [footer, setFooter] = useState(initial.invoiceFooterText ?? "");
  const [prefix, setPrefix] = useState(initial.invoiceNumberPrefix ?? "");
  const [padding, setPadding] = useState(String(initial.invoiceNumberPadding));

  // Live preview of an invoice number with the current settings.
  const numberPreview = useMemo(() => {
    const padNum = parseInt(padding, 10) || 0;
    const seq = padNum > 0 ? "1".padStart(padNum, "0") : "1";
    const year = new Date().getFullYear();
    const pref = prefix.trim();
    return pref ? `${pref}-${year}-${seq}` : `${year}-${seq}`;
  }, [prefix, padding]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("defaultCurrency", currency);
    fd.append("defaultInvoiceDueOffsetDays", dueOffset);
    fd.append("invoiceFooterText", footer);
    fd.append("invoiceNumberPrefix", prefix);
    fd.append("invoiceNumberPadding", padding);

    startTransition(async () => {
      try {
        const result = await updateBillingDefaults(fd);
        if (result.ok) toast.success(t("updatedToast"));
        else toast.error(t("errorToast"));
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("billing.defaultCurrency")} htmlFor="defaultCurrency">
          <Select
            id="defaultCurrency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("billing.dueOffsetDays")}
          htmlFor="defaultInvoiceDueOffsetDays"
          hint={t("billing.dueOffsetHint")}
        >
          <Input
            id="defaultInvoiceDueOffsetDays"
            type="number"
            min={0}
            max={365}
            value={dueOffset}
            onChange={(e) => setDueOffset(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field
          label={t("billing.invoiceNumberPrefix")}
          htmlFor="invoiceNumberPrefix"
          hint={t("billing.invoiceNumberPrefixHint")}
        >
          <Input
            id="invoiceNumberPrefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            maxLength={20}
            placeholder="INV"
            spellCheck={false}
          />
        </Field>
        <Field
          label={t("billing.invoiceNumberPadding")}
          htmlFor="invoiceNumberPadding"
        >
          <Select
            id="invoiceNumberPadding"
            value={padding}
            onChange={(e) => setPadding(e.target.value)}
          >
            {PADDING_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === 0 ? t("billing.paddingNone") : `${p} digits`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          {t("billing.numberPreview")}
        </p>
        <p className="mt-1 font-mono text-base text-[color:var(--color-foreground)]">
          {numberPreview}
        </p>
      </div>

      <Field
        label={t("billing.invoiceFooterText")}
        htmlFor="invoiceFooterText"
        hint={t("billing.invoiceFooterHint")}
      >
        <Textarea
          id="invoiceFooterText"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("billing.invoiceFooterPlaceholder")}
        />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("payslip");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-brand-500)] px-4 py-2 text-sm font-medium text-[color:var(--color-foreground-onbrand)] shadow-card transition-opacity hover:opacity-90"
    >
      <Printer className="size-4" aria-hidden />
      {t("print")}
    </button>
  );
}

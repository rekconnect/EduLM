"use client";

import { Download } from "lucide-react";

/**
 * Client-side CSV export. Serializes the given headers + rows to a
 * semicolon-delimited CSV (Excel-FR friendly) with a UTF-8 BOM so accented
 * names and Arabic render correctly, then triggers a download. No server
 * round-trip — the data is already on the page.
 */
export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  function download() {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows]
      .map((r) => r.map(esc).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-all duration-150 ease-out hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-foreground)] active:scale-[0.98]"
    >
      <Download className="size-3.5" aria-hidden />
      Exporter CSV
    </button>
  );
}

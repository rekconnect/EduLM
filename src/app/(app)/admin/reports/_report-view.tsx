"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TR, TH, TD, EmptyRow } from "@/components/ui/table";
import type { CycleOption } from "./_actions";

export type ReportColumn<T> = { key: keyof T; header: string };

/**
 * Generic report view — table preview + CSV download. Used by each
 * report sub-page so they all behave identically (search, cycle
 * filter, count, export).
 */
export function ReportView<T extends Record<string, unknown>>({
  title,
  rows,
  columns,
  csvFilename,
  csvContent,
  cycles,
  currentCycleId,
  searchKeys,
}: {
  title: string;
  rows: T[];
  columns: ReportColumn<T>[];
  csvFilename: string;
  csvContent: string;
  cycles: CycleOption[];
  currentCycleId: string | null;
  /** Keys to scan for the live search box. */
  searchKeys: ReadonlyArray<keyof T>;
}) {
  const t = useTranslations("reports");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, searchKeys]);

  function onDownload() {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onCycleChange(id: string) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("cycleId", id);
    else url.searchParams.delete("cycleId");
    window.location.href = url.toString();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={title} description={t("rowCount", { count: filtered.length })} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search
                  className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="ps-8"
                />
              </div>
              <Select
                value={currentCycleId ?? ""}
                onChange={(e) => onCycleChange(e.target.value)}
                className="w-56"
              >
                <option value="">{t("allCycles")}</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {c.targetYearLabel}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              onClick={onDownload}
              disabled={filtered.length === 0}
              className="gap-1.5"
            >
              <Download className="size-3.5" aria-hidden />
              {t("exportCsv")}
            </Button>
          </div>

          <Table>
            <THead>
              <tr>
                {columns.map((c) => (
                  <TH key={String(c.key)}>{c.header}</TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyRow colSpan={columns.length}>{t("emptyRows")}</EmptyRow>
              ) : (
                filtered.slice(0, 500).map((r, i) => (
                  <TR key={String(r.applicationId ?? i)}>
                    {columns.map((c) => (
                      <TD key={String(c.key)}>{String(r[c.key] ?? "")}</TD>
                    ))}
                  </TR>
                ))
              )}
            </tbody>
          </Table>
          {filtered.length > 500 ? (
            <p className="text-xs text-[color:var(--color-foreground-muted)]">
              {t("previewCapped", { shown: 500, total: filtered.length })}
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

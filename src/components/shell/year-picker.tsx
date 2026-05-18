"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";

export type YearOption = { id: string; label: string; isActive: boolean };

/**
 * Self-submitting year filter. Writes the chosen year id to `?yearId=...` and
 * navigates immediately (replaces the entry so the back button doesn't fill
 * with toolbar interactions).
 */
export function YearPicker({
  years,
  selectedId,
  name = "yearId",
}: {
  years: YearOption[];
  selectedId: string;
  name?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set(name, e.target.value);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <Select name={name} value={selectedId} onChange={onChange} disabled={pending}>
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.label}
          {y.isActive ? " (active)" : ""}
        </option>
      ))}
    </Select>
  );
}

/**
 * Generic single-key URL-synced select. Used for the scope toggle on /students
 * ("Tous les élèves" vs "Inscrits cette année").
 */
export function UrlSelect({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set(name, e.target.value);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <Select name={name} value={value} onChange={onChange} disabled={pending}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Live URL-synced search box. Debounces input by 250ms then pushes `?q=` to
 * the URL — Next.js re-renders the server component with the new param.
 */
export function ParentsSearchBox() {
  const t = useTranslations("parents");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (value.trim() === "") sp.delete("q");
      else sp.set("q", value.trim());
      sp.delete("page"); // new search → back to first page
      const next = sp.toString();
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-foreground-subtle)]"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("search")}
        autoComplete="off"
        className="ps-9 pe-9"
      />
      <div className="absolute end-2 top-1/2 -translate-y-1/2">
        {pending ? (
          <Loader2
            className="size-4 animate-spin text-[color:var(--color-foreground-subtle)]"
            aria-hidden
          />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label={t("clearSearch")}
            className="inline-flex size-5 items-center justify-center rounded-sm text-[color:var(--color-foreground-subtle)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

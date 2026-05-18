"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const [, startTransition] = useTransition();

  // Push to URL after a short debounce so we don't spam navigations on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      if (value.trim() === "") sp.delete("q");
      else sp.set("q", value.trim());
      const next = sp.toString();
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={t("search")}
      autoComplete="off"
    />
  );
}

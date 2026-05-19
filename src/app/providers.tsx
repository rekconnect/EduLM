"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              "bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] border-[color:var(--color-border-subtle)] shadow-[0_4px_6px_oklch(0_0_0/0.05),0_10px_15px_oklch(0_0_0/0.06)]",
            description: "text-[color:var(--color-foreground-muted)]",
          },
        }}
      />
    </ThemeProvider>
  );
}

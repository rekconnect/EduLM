import * as React from "react";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-[color:var(--color-surface-sunken)] text-start text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-muted)]">
      {children}
    </thead>
  );
}

export function TR({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-t border-[color:var(--color-border-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)]">
      {children}
    </tr>
  );
}

export function TH({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}

export function TD({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

export function EmptyRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-4 py-8 text-center text-[color:var(--muted-fg)]"
      >
        {children}
      </td>
    </tr>
  );
}

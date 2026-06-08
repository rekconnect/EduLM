/**
 * Read-only Arabic ("Info Arabe") view for a student, mirroring the Dars
 * fiche: general info (name, father, registration, birthplace) + address,
 * aggregated from the student + father + family. Rendered RTL.
 */
export type ArabicSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export function ArabicFicheView({ sections }: { sections: ArabicSection[] }) {
  const hasAny = sections.some((s) => s.rows.some((r) => r.value.trim()));
  return (
    <div dir="rtl" className="space-y-5">
      {!hasAny ? (
        <p className="text-sm text-[color:var(--color-foreground-subtle)]">
          لا توجد معلومات بالعربية بعد.
        </p>
      ) : (
        sections.map((s) => (
          <div key={s.title} className="space-y-2">
            <h4 className="text-[0.8rem] font-semibold tracking-tight text-[color:var(--color-brand-700)]">
              {s.title}
            </h4>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {s.rows.map((r) => (
                <div
                  key={r.label}
                  className="flex items-baseline justify-between gap-3 border-b border-[color:var(--color-border-subtle)] pb-1.5"
                >
                  <dt className="text-xs text-[color:var(--color-foreground-muted)]">
                    {r.label}
                  </dt>
                  <dd
                    className={
                      "text-sm font-medium " +
                      (r.value.trim()
                        ? "text-[color:var(--color-foreground)]"
                        : "text-[color:var(--color-foreground-subtle)]")
                    }
                  >
                    {r.value.trim() || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </div>
  );
}

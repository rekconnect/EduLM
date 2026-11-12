/**
 * "E-mail non vérifié" pill — a self-registered parent account whose address
 * nobody has confirmed yet.
 *
 * Neutral tone on purpose: until e-mail verification ships, every new online
 * sign-up carries it, so it has to inform without turning lists into a wall
 * of warnings. `title` carries the longer explanation (and the address when
 * the surrounding row does not show it).
 *
 * `sm` sits inside table rows; `md` matches the pills of a dossier's status
 * row.
 */
export function UnverifiedEmailBadge({
  label,
  title,
  size = "sm",
}: {
  label: string;
  title?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      title={title}
      className={
        "inline-flex shrink-0 items-center rounded-full bg-[color:var(--color-surface-sunken)] font-medium uppercase tracking-wider text-[color:var(--color-foreground-muted)] " +
        (size === "md" ? "px-3 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]")
      }
    >
      {label}
    </span>
  );
}

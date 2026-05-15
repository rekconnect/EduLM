import { signOut } from "@/lib/auth";

export function SignOutButton({ label }: { label: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[color:var(--muted)]"
      >
        {label}
      </button>
    </form>
  );
}

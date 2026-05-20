import { Skeleton } from "@/components/ui/skeleton";

/**
 * Navigation loading skeleton for everything inside (app). The (app)/layout
 * provides the sidebar — this only fills the content slot, so the sidebar
 * stays mounted during navigation (no flicker, click feels immediate).
 */
export default function AppLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Content rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </main>
  );
}

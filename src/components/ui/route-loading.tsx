/**
 * Route-level loading boundary body — lets the App Router commit a
 * navigation instantly (URL + shell paint) while the target segment's
 * server render is in flight, instead of blocking the click on it.
 * Same pattern as the CRM's CrmViewSkeleton.
 */
export function RouteLoading() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-3xl animate-pulse px-4 py-8 sm:px-6"
    >
      <div className="mb-6 h-7 w-48 rounded-md bg-surface-hover" />
      <div className="space-y-3">
        <div className="h-20 rounded-lg bg-surface-hover" />
        <div className="h-20 rounded-lg bg-surface-hover" />
        <div className="h-20 rounded-lg bg-surface-hover" />
      </div>
    </div>
  );
}

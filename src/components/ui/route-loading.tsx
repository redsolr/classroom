import { cn } from "@/lib/utils";

/**
 * Route-level loading skeletons — one per surface, each mirroring the
 * real layout it stands in for (a skeleton shaped like a different page
 * reads as a flash of the wrong screen). Teacher/student skeletons render
 * INSIDE their layout's `max-w-6xl px-10 py-10` wrapper, so they carry no
 * container of their own; study skeletons match each study page's own
 * container exactly.
 */

function Bone({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-surface-hover", className)} />;
}

/** Teacher pages: page heading, then the schedule's 320px+1fr split. */
export function TeacherRouteSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <Bone className="mb-6 h-7 w-56" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2.5">
          <Bone className="h-16 rounded-lg" />
          <Bone className="h-16 rounded-lg" />
          <Bone className="h-16 rounded-lg" />
          <Bone className="h-16 rounded-lg" />
        </div>
        <Bone className="hidden h-96 rounded-lg lg:block" />
      </div>
    </div>
  );
}

/** Student area: heading + full-width content sections. */
export function StudentRouteSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <Bone className="mb-6 h-7 w-56" />
      <div className="space-y-4">
        <Bone className="h-24 rounded-lg" />
        <Bone className="h-24 rounded-lg" />
        <Bone className="h-24 rounded-lg" />
      </div>
    </div>
  );
}

/** /study — the chat two-pane: thread sidebar, header, bubbles, composer. */
export function StudyChatSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-5xl animate-pulse"
    >
      <aside className="hidden w-64 shrink-0 flex-col gap-2 border-r border-border p-3 lg:flex">
        <Bone className="h-9" />
        <Bone className="h-12" />
        <Bone className="h-12" />
        <Bone className="h-12" />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-2.5 sm:px-6">
          <Bone className="h-5 w-40" />
        </div>
        <div className="flex-1 space-y-3 px-4 py-5 sm:px-6">
          <Bone className="mr-10 h-16 rounded-lg sm:mr-16" />
          <Bone className="ml-10 h-10 rounded-lg sm:ml-16" />
          <Bone className="mr-10 h-16 rounded-lg sm:mr-16" />
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <Bone className="h-9" />
        </div>
      </section>
    </div>
  );
}

/** /study/vocab — heading, add-word card, word rows. */
export function StudyVocabSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-3xl animate-pulse px-4 py-8 sm:px-6"
    >
      <Bone className="mb-2 h-8 w-48" />
      <Bone className="mb-6 h-4 w-64" />
      <Bone className="mb-8 h-56 rounded-lg" />
      <div className="space-y-2">
        <Bone className="h-14 rounded-lg" />
        <Bone className="h-14 rounded-lg" />
        <Bone className="h-14 rounded-lg" />
      </div>
    </div>
  );
}

/** /study/vocab/review — heading + the flashcard. */
export function StudyReviewSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-xl animate-pulse px-4 py-8 sm:px-6"
    >
      <Bone className="mb-5 h-8 w-32" />
      <Bone className="mb-3 h-4 w-28" />
      <Bone className="h-56 rounded-lg" />
    </div>
  );
}

/** /study/account — heading + the three settings cards. */
export function StudyAccountSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-2xl animate-pulse px-4 py-8 sm:px-6"
    >
      <Bone className="mb-2 h-8 w-40" />
      <Bone className="mb-6 h-4 w-56" />
      <div className="space-y-5">
        <Bone className="h-28 rounded-lg" />
        <Bone className="h-24 rounded-lg" />
        <Bone className="h-24 rounded-lg" />
      </div>
    </div>
  );
}

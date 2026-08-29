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

/** /chat — single conversation column (threads live in the sidebar). */
export function StudyChatSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto flex h-[calc(100dvh-3rem)] w-full max-w-3xl animate-pulse flex-col lg:h-dvh"
    >
      <div className="border-b border-border px-4 py-2.5 sm:px-6">
        <Bone className="h-5 w-40" />
      </div>
      <div className="flex-1 space-y-3 px-4 py-5 sm:px-6">
        <Bone className="mr-10 h-16 rounded-lg sm:mr-16" />
        <Bone className="ml-10 h-10 rounded-lg sm:ml-16" />
        <Bone className="mr-10 h-16 rounded-lg sm:mr-16" />
      </div>
      <div className="px-4 pt-1 pb-4 sm:px-6">
        <Bone className="h-20 rounded-2xl" />
      </div>
    </div>
  );
}

/** /vocab — heading, add-word card, word rows. */
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

/** /vocab/review — heading + the deck shelf. The route's landing is the
 * shelf now; the drill is one click deeper and shares this segment, so
 * the rows are the shape worth matching. */
export function StudyReviewSkeleton() {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-3xl animate-pulse px-4 py-8 sm:px-6"
    >
      <Bone className="mb-2 h-8 w-32" />
      <Bone className="mb-6 h-4 w-56" />
      <div className="space-y-2">
        <Bone className="h-20 rounded-lg" />
        <Bone className="h-20 rounded-lg" />
        <Bone className="h-20 rounded-lg" />
      </div>
    </div>
  );
}

/** /account — heading + the three settings cards. */
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenText, GraduationCap, Sparkles, Users } from "lucide-react";
import { getTeacher } from "@/lib/auth";

export default async function LandingPage() {
  const teacher = await getTeacher();
  if (teacher) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <span className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-white">
            <GraduationCap className="size-4" />
          </span>
          Class-room
        </span>
        <Link
          href="/login"
          className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-[0.85rem] font-medium shadow-sm transition-colors hover:bg-surface-hover"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[0.75rem] font-medium text-fg-secondary">
          <Sparkles className="size-3.5 text-accent" />
          For independent language tutors
        </p>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Remember every student.
          <br />
          <span className="text-fg-secondary">Know what to teach next.</span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-[1rem] leading-relaxed text-fg-secondary">
          Paste your rough notes after each lesson. Class-room turns them into
          corrections, vocabulary, homework and a professional student recap —
          and keeps a living memory of every learner.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-[0.9rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
        >
          Get started — it&rsquo;s free
          <ArrowRight className="size-4" />
        </Link>

        <div className="mt-20 grid max-w-3xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Student memory",
              body: "Levels, goals, recurring mistakes and vocabulary — one living record per learner.",
            },
            {
              icon: Sparkles,
              title: "AI lesson notes",
              body: "Rough notes in, structured lesson records out. You approve everything before it's saved.",
            },
            {
              icon: BookOpenText,
              title: "Student recaps",
              body: "A clean, shareable summary after every lesson. Private notes stay private.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl bg-surface p-4 shadow-card"
            >
              <f.icon className="mb-2 size-4.5 text-accent" />
              <p className="text-[0.85rem] font-semibold">{f.title}</p>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-fg-secondary">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

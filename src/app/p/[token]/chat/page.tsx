import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, GraduationCap, Sparkles } from "lucide-react";
import { aiMessages, db, students } from "@/db";
import { sendCompanionMessage } from "@/lib/actions/portal";
import { SubmitButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export const metadata: Metadata = { title: "Study companion" };

const VISIBLE_MESSAGES = 50;

/**
 * The student's AI study companion — conversations grounded in their own
 * approved learning record (shared layer only), stored as part of their
 * accumulating context.
 */
export default async function CompanionChatPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
    columns: { id: true, name: true, targetLanguage: true },
  });
  if (!student) notFound();

  const allMessages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.studentId, student.id))
    .orderBy(asc(aiMessages.createdAt));
  const messages = allMessages.slice(-VISIBLE_MESSAGES);

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-10">
      <header className="mb-6">
        <p className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-tertiary">
          <span className="flex size-5 items-center justify-center rounded bg-accent text-white">
            <GraduationCap className="size-3" />
          </span>
          Study companion
        </p>
        <h1 className="text-[1.625rem] font-semibold tracking-tight">
          Practice anytime
        </h1>
        <p className="mt-1 text-[0.9375rem] text-fg-secondary">
          I know what you&rsquo;re working on with your teacher — your words,
          your corrections, your goals. Let&rsquo;s use them.
        </p>
      </header>

      <div className="flex-1 space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-surface px-4 py-4 shadow-card">
            <p className="flex items-start gap-2.5 text-[0.9375rem] leading-relaxed">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>
                Hi {student.name}! Ask me anything about your{" "}
                {student.targetLanguage} — or just start chatting and
                I&rsquo;ll help you practice what you&rsquo;ve been learning.
              </span>
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-accent-soft px-4 py-2.5"
                  : "mr-8 rounded-lg bg-surface px-4 py-2.5 shadow-card"
              }
            >
              <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                {m.content}
              </p>
            </div>
          ))
        )}
      </div>

      <form
        action={sendCompanionMessage.bind(null, token)}
        className="mt-6 flex items-center gap-2"
      >
        <Input
          name="message"
          required
          maxLength={2000}
          autoComplete="off"
          placeholder="Say something…"
          className="flex-1"
        />
        <SubmitButton>Send</SubmitButton>
      </form>

      <footer className="mt-6 border-t border-border pt-4 text-center text-[0.78rem] text-fg-tertiary">
        <Link
          href={`/p/${token}`}
          className="inline-flex items-center gap-1 hover:text-fg"
        >
          <ArrowLeft className="size-3" />
          Back to your classroom
        </Link>
      </footer>
    </div>
  );
}

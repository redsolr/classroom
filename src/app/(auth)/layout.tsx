import Link from "next/link";
import { GraduationCap } from "lucide-react";

/**
 * Auth shell — layout ported from Jurisimus web-app: brand wordmark
 * top-left, animated velvet gradient backdrop, centered white card.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-velvet relative flex min-h-dvh flex-col overflow-x-clip">
      <div className="relative z-20 shrink-0 px-6">
        <div className="mx-auto max-w-[1300px]">
          <div className="flex h-16 items-center">
            <Link
              href="/"
              className="flex items-center gap-2 text-[1.05rem] font-bold tracking-tight text-[var(--auth-on-velvet)]"
            >
              <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--auth-on-velvet-chip)] backdrop-blur">
                <GraduationCap className="size-4.5" />
              </span>
              Class-room
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex w-full flex-1 items-start justify-center px-4 py-6 md:items-center md:py-8">
        <div className="auth-card w-full max-w-[480px] rounded-2xl px-6 pb-6 pt-7 sm:px-8">
          {children}
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-end gap-5 px-8 py-4">
        <span className="text-xs font-semibold text-[var(--auth-on-velvet-muted)]">
          Class-room — the private memory of an independent teacher
        </span>
      </div>
    </div>
  );
}

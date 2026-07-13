import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
          <GraduationCap className="size-4.5" />
        </span>
        Class-room
      </Link>
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-card">
        {children}
      </div>
    </div>
  );
}

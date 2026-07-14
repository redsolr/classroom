import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Anchor styled like the secondary Button — the "link that looks like a
 * button" pattern (prep shortcuts, week navigation, panel actions).
 */
export function LinkButton({
  href,
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center font-medium shadow-sm transition-colors",
        "rounded-md border border-border-strong bg-surface hover:bg-surface-hover",
        size === "sm"
          ? "h-7 gap-1 px-2 text-[0.8125rem]"
          : "h-8 gap-1.5 px-3 text-[0.875rem]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

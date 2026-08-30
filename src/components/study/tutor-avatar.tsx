import { cn } from "@/lib/utils";

/**
 * A tutor's tile.
 *
 * Generated, not uploaded — the same decision the book covers made, and
 * for the same reason: the app has no file storage and deliberately does
 * not want any ("organize MEANING, not files"). A directory of people
 * still needs faces to scan, so each tutor gets a deterministic gradient
 * keyed to their name plus their initials, which is enough for the eye
 * to learn "the teal one is Marie" after two visits.
 *
 * Circular here rather than the square/portrait artwork the shelves use:
 * a round tile reads as a person and a rectangular one reads as a
 * product, and this row is a list of people.
 */

/** Same hashing idea as the collection covers — a stable hue per name. */
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TutorAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cn(
        "tutor-avatar flex aspect-square items-center justify-center rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 62% 46%), hsl(${(hue + 40) % 360} 58% 34%))`,
        // Scales with the tile instead of being fixed, so the same
        // component works at 40px in a list row and 96px on a profile.
        fontSize: "38%",
      }}
    >
      {initials(name)}
    </span>
  );
}

import { SearchBar } from "@/components/study/search-bar";

/**
 * The DESKTOP top bar — one persistent search field across every study
 * page.
 *
 * Search used to live in the body of `/home` and `/search`, which meant
 * it scrolled away the moment you started reading, and simply did not
 * exist on Books, Decks, Sentences or a chat. Every app this product is
 * shaped after (Spotify, YouTube Music) keeps the field pinned, because
 * search is how you re-enter a library rather than a page you visit.
 *
 * Phones keep the field in the page body instead: the top edge there is
 * already spent on the hamburger navbar, and the bottom tab bar covers
 * re-entry. So the bar renders only at lg, and the space it OCCUPIES is
 * PUBLISHED as `--study-topbar-h` (0 below lg) so the full-height chat
 * pane sizes around it with one expression — the same contract
 * `--study-tabbar-h` already uses at the other edge. The var is 4rem
 * while the bar is `h-14`: 3.5rem of bar plus the 0.5rem it floats down
 * from the top.
 *
 * TWO layers, and the second one is why this works while scrolling.
 *
 *   scrim   a full-width wash of the page ground, strongest at the top
 *           edge and fully gone by the bar's bottom edge. An INSET bar
 *           has gaps — 8px above it, 8px to its right — and content
 *           travelled through those gaps unmuted, so covers appeared to
 *           be sliced off above the bar. The scrim covers the whole
 *           strip, gaps included, so everything approaching the bar
 *           fades into the ground instead of being cut.
 *
 *           Its height is EXACTLY `--study-topbar-h`, never more. A
 *           first cut ran 2rem past the bar to soften the hand-off and
 *           instead greyed the top of whatever sat below it — the
 *           spotlight lost its colour just for being near the bar. The
 *           scrim's job is the content passing BEHIND the bar; content
 *           the bar has already cleared is not its business.
 *   bar     the floating panel itself, matching the sidebar (inset,
 *           rounded, `shadow-card`).
 *
 * The scrim is a color-mix of `--bg`, not a solid: at ~92% it darkens
 * what passes beneath without hiding it, so the glass still reads as
 * glass. Solid would have been simpler and would have thrown away the
 * effect the bar exists to have. Theme-agnostic for the same reason —
 * mixing the ground token means light mode gets a light wash rather
 * than a black one.
 */
/**
 * The inset is the wrapper's PADDING, never the bar's margin. A sticky
 * box is pinned by its BORDER edge, so a `margin-top` holds the bar 8px
 * down at rest and is then ignored the moment sticking engages — the bar
 * visibly jumps up by exactly that margin on the first scroll. Padding
 * lives inside the border box, so the offset survives sticking and the
 * bar never moves. The explicit height also makes the box measurably
 * equal to `--study-topbar-h`, rather than equal by an arithmetic that a
 * later margin could quietly break.
 */
export function StudyTopbar() {
  return (
    <div className="study-topbar-wrap sticky top-0 z-30 hidden h-[var(--study-topbar-h)] pt-2 pr-2 lg:block">
      <div
        aria-hidden
        className="study-topbar-scrim pointer-events-none absolute inset-x-0 top-0 h-full"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--bg) 94%, transparent) 0%, color-mix(in srgb, var(--bg) 62%, transparent) 65%, transparent 100%)",
        }}
      />
      <header className="study-topbar relative flex h-14 items-center rounded-xl bg-surface/70 px-16 shadow-card backdrop-blur-xl xl:px-[5.5rem]">
        {/* Centred on the pane, capped so it stays a field and doesn't
            stretch into a banner on a wide monitor. */}
        <div className="mx-auto w-full max-w-xl">
          <SearchBar variant="bar" />
        </div>
      </header>
    </div>
  );
}

import { create } from "zustand";

/**
 * What the PHONE navbar should show on its left edge.
 *
 * On a phone, "where am I and how do I get out" is answered at the top
 * left — that is the convention every native app and every mobile web
 * app the product is shaped after uses. The desktop answer is different:
 * a persistent sidebar means you are never lost, so a detail page shows
 * an inline "← All decks" above its title and the top edge stays clean.
 *
 * So a detail page declares ONE back target and each viewport renders it
 * its own way: inline above the header at lg, and as the navbar's lead
 * control below it — where it REPLACES the hamburger, the way a pushed
 * screen replaces a menu button on iOS. The drawer is still one tap
 * away, from the parent the back arrow returns to.
 *
 * A store rather than a portal because the navbar has to know whether a
 * back target EXISTS in order to decide what to render in that slot; a
 * portal can fill a slot but cannot tell its host that it did.
 */

export type MobileBackTarget = {
  href: string;
  /** Where the arrow goes, for the accessible name ("Back to All decks"). */
  label: string;
};

type MobileNavState = {
  back: MobileBackTarget | null;
  setBack: (target: MobileBackTarget) => void;
  clearBack: (href: string) => void;
};

export const useMobileNav = create<MobileNavState>((set) => ({
  back: null,
  setBack: (target) => set({ back: target }),
  // Keyed on href: React mounts the NEXT page's registrar before it
  // unmounts the previous one's, so an unconditional clear on unmount
  // would wipe the target the incoming page just set. Clearing only when
  // the stored target is still the one this registrar owns makes the
  // order irrelevant.
  clearBack: (href) =>
    set((state) => (state.back?.href === href ? { back: null } : state)),
}));

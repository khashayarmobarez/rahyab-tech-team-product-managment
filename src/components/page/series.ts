import type { PersonSlug } from "@/lib/constants";

/**
 * Each person's chart colour. Full class names are written out so Tailwind sees them.
 * The order (blue, orange, violet) never changes, so a colour always means the same person.
 */
export const SERIES_BG: Record<PersonSlug, string> = {
  khashayar: "bg-series-1",
  mahan: "bg-series-2",
  hossein: "bg-series-3",
};

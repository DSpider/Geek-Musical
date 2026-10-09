import type { PostSummary } from "./content.js";

// Editorial tracking is intentionally independent from the live search provider.
export const BLOG_AMAZON_TAG = "geekmusical-20";
export type CategoryArtKind =
  | "home"
  | "kitchen"
  | "cleaning"
  | "coffee"
  | "organization"
  | "garden"
  | "laptop"
  | "phone"
  | "watch"
  | "audio"
  | "tablet"
  | "monitor"
  | "router"
  | "tv"
  | "camera"
  | "drone"
  | "console"
  | "mouse";
export interface HomePostCard extends Pick<
  PostSummary,
  "id" | "url" | "title" | "readingMinutes"
> {
  excerpt?: string;
  category: string;
  art: CategoryArtKind;
  image?: { url: string; alt: string };
}

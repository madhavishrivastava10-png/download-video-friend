import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Design = Tables<"designs">;
export type MediaItem = Tables<"media_items">;

export const PLATFORMS = [
  { id: "all", label: "All Platforms" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
  { id: "snapchat", label: "Snapchat" },
  { id: "upload", label: "My uploads" },
] as const;

export const CONTENT_TYPES = [
  { id: "all", label: "All" },
  { id: "reels", label: "Reels" },
  { id: "videos", label: "Videos" },
  { id: "posts", label: "Posts" },
] as const;

export const TEMPLATES = [
  { id: "reel", name: "Reel Grid", blurb: "Perfect for reels & short videos", rows: 5, cols: 3 },
  { id: "video", name: "Video Grid", blurb: "For long videos & vlogs", rows: 4, cols: 2 },
  { id: "mixed", name: "Mixed Media", blurb: "Reels + Posts + Videos", rows: 4, cols: 4 },
  { id: "custom", name: "Custom Grid", blurb: "Create your own layout", rows: 3, cols: 3 },
] as const;

export function platformLabel(id: string) {
  return PLATFORMS.find((p) => p.id === id)?.label ?? "Media";
}

/** Turns stored file paths into temporary playable links for the signed-in owner. */
export async function signMedia(items: MediaItem[]) {
  return Promise.all(
    items.map(async (item) => {
      if (!item.storage_path) return { ...item, playback_url: item.media_url };
      const { data } = await supabase.storage.from("media").createSignedUrl(item.storage_path, 60 * 60 * 6);
      return { ...item, playback_url: data?.signedUrl ?? item.media_url };
    }),
  );
}

export type PlayableMedia = MediaItem & { playback_url: string };

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "grid"}-${Math.random().toString(36).slice(2, 7)}`;
}

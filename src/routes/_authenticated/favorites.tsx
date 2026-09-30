import { MediaView } from "@/components/media-view";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Heart, Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signMedia, type PlayableMedia } from "@/lib/reel-grid";
import { downloadMedia, mediaFilename, EMBED_NO_DOWNLOAD } from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlatformBadge } from "@/components/platform-badge";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({
    meta: [
      { title: "Favorites — Reel Grid" },
      { name: "description", content: "Your favorite videos and photos from all your grids." },
      { property: "og:title", content: "Favorites — Reel Grid" },
      { property: "og:description", content: "Your favorite videos and photos from all your grids." },
    ],
  }),
  component: FavoritesPage,
});

type FavRow = PlayableMedia & { favorite_id: string; design_title: string };

function FavoritesPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<FavRow | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, media_item_id, media_items(*, designs(title))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const items = (data ?? [])
        .map((f) => {
          const m = f.media_items as unknown as Record<string, unknown> & {
            designs?: { title?: string } | null;
          } | null;
          if (!m) return null;
          return { ...m, favorite_id: f.id, design_title: m.designs?.title ?? "Grid" };
        })
        .filter(Boolean);
      const signed = await signMedia(items as unknown as Parameters<typeof signMedia>[0]);
      return signed as unknown as FavRow[];
    },
  });

  const items = rows ?? [];

  async function unfavorite(item: FavRow) {
    const { error } = await supabase.from("favorites").delete().eq("id", item.favorite_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed from favorites");
    setActive(null);
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
  }

  async function handleDownload(item: FavRow) {
    setDownloading(true);
    try {
      if (item.media_type === "embed") throw new Error(EMBED_NO_DOWNLOAD);
      await downloadMedia(item.playback_url, mediaFilename(item.caption, item.media_type));
      toast.success("Download started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <h1 className="font-display text-xl font-extrabold sm:text-2xl">Favorites</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {items.length} saved item{items.length === 1 ? "" : "s"} across your grids
        </p>
      </header>

      {isLoading ? (
        <div className="mt-16 grid place-items-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card-soft mt-8 grid place-items-center gap-3 px-6 py-16 text-center">
          <Heart className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Open a grid and tap the heart on any video or photo to save it here.
          </p>
          <Button asChild className="rounded-xl">
            <Link to="/designs">Go to my designs</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.favorite_id}
              onClick={() => setActive(item)}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm transition-transform hover:-translate-y-1"
            >
              <MediaView item={item} mode="thumb" />
              <span className="absolute left-2 top-2">
                <PlatformBadge platform={item.platform} />
              </span>
              <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-card/90 text-primary shadow">
                <Heart className="size-3.5" fill="currentColor" />
              </span>
              {item.media_type === "video" && (
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-10 place-items-center rounded-full bg-foreground/45 text-background backdrop-blur-sm">
                    <Play className="size-4" fill="currentColor" />
                  </span>
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-foreground/60 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-background">
                {item.design_title}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{active?.design_title ?? "Media"}</DialogTitle>
            <DialogDescription>Play, download or remove this favorite.</DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl bg-foreground/90">
                <MediaView item={active} mode="player" />
              </div>
              {active.caption && <p className="text-sm text-muted-foreground">{active.caption}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => unfavorite(active)}>
                  <Heart className="size-4" /> Remove
                </Button>
                <Button className="rounded-xl" onClick={() => handleDownload(active)} disabled={downloading}>
                  {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

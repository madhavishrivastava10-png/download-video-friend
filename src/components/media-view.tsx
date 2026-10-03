import { useEffect, useState } from "react";
import { ExternalLink, Instagram, Loader2, Play } from "lucide-react";

type ViewItem = {
  media_type: string;
  playback_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  title?: string | null;
  source_url?: string | null;
};

function instagramLink(item: ViewItem) {
  return item.source_url || item.playback_url.replace(/\/embed(\/captioned)?\/?$/, "/");
}

/** Builds Instagram's official embed URL (same one their embed.js uses) from any saved Reel/post link. */
function instagramEmbedUrl(item: ViewItem) {
  const src = item.source_url || item.playback_url;
  const m = src.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/p/${m[1]}/embed/captioned/` : item.playback_url;
}

function InstagramFallback({ item }: { item: ViewItem }) {
  return (
    <div className="flex flex-col items-center gap-3 p-6 text-center">
      <Instagram className="size-8 text-primary" />
      <p className="max-w-xs text-sm font-medium">This Instagram Reel can't be played here. Open it on Instagram.</p>
      <a
        href={instagramLink(item)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <ExternalLink className="size-4" /> Open on Instagram
      </a>
    </div>
  );
}

function InstagramPlayer({ item, alt }: { item: ViewItem; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    // Never spin forever: if Instagram's player hasn't loaded in 12s, show the fallback.
    const t = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), 12000);
    return () => clearTimeout(t);
  }, []);
  if (state === "failed") return <InstagramFallback item={item} />;
  return (
    <div className="flex flex-col items-center gap-2 bg-background p-2">
      <div className="relative aspect-[9/16] w-full max-w-[min(340px,calc((70vh)*9/16))] overflow-hidden rounded-2xl border border-border bg-muted">
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          src={instagramEmbedUrl(item)}
          title={alt}
          className="absolute inset-0 size-full"
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      </div>
      <button
        type="button"
        onClick={() => setState("failed")}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Not playing? Show options
      </button>
    </div>
  );
}

function InstagramCard({ label }: { label: string }) {
  return (
    <div className="brand-gradient flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-primary-foreground">
      <Instagram className="size-7" />
      <span className="text-xs font-semibold">{label}</span>
      <span className="flex items-center gap-1 text-[10px] opacity-90">
        <Play className="size-3 fill-current" /> Tap to play
      </span>
    </div>
  );
}

/** Renders a stored file, or an official embedded player for platforms like YouTube / Instagram. */
export function MediaView({ item, mode, controls }: { item: ViewItem; mode: "thumb" | "player"; controls?: boolean }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const alt = item.caption ?? item.title ?? "Media";
  if (item.media_type === "embed") {
    const isIg = item.playback_url.includes("instagram.com");
    if (mode === "thumb") {
      if (item.thumbnail_url && !thumbFailed) {
        return (
          <img
            src={item.thumbnail_url}
            alt={alt}
            className="size-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
          />
        );
      }
      return isIg ? <InstagramCard label={item.title || "Instagram Reel"} /> : <div className="size-full bg-muted" />;
    }
    if (isIg) return <InstagramPlayer item={item} alt={alt} />;
    return (
      <iframe
        src={item.playback_url}
        title={alt}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (item.media_type === "image") {
    return mode === "thumb" ? (
      <img src={item.playback_url} alt={alt} className="size-full object-cover" />
    ) : (
      <img src={item.playback_url} alt={alt} className="max-h-80 w-full object-contain" />
    );
  }
  return mode === "thumb" ? (
    <video src={`${item.playback_url}#t=0.1`} className="size-full object-cover" muted={!controls} controls={controls} playsInline preload="metadata" />
  ) : (
    <video src={item.playback_url} controls className="max-h-80 w-full" />
  );
}

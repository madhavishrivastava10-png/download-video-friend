import { useState } from "react";
import { ExternalLink, Instagram, Play } from "lucide-react";

type ViewItem = {
  media_type: string;
  playback_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  title?: string | null;
  source_url?: string | null;
};

function instagramLink(item: ViewItem) {
  return item.source_url || item.playback_url.replace(/\/embed\/?$/, "/");
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
    if (isIg) {
      return (
        <div className="flex flex-col items-center gap-3 bg-background p-3">
          <div className="aspect-[9/16] h-[min(70vh,620px)] max-w-full overflow-hidden rounded-[2rem] border-[6px] border-foreground bg-muted shadow-lg">
            <iframe
              src={item.playback_url}
              title={alt}
              className="size-full"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Plays through Instagram — not downloaded. If it doesn't load, the Reel may be private, deleted, or the owner turned off embedding.
          </p>
          <a
            href={instagramLink(item)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-accent/60"
          >
            <ExternalLink className="size-4" /> Open on Instagram
          </a>
        </div>
      );
    }
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

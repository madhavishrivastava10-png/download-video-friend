import { useEffect, useRef, useState } from "react";
import { Instagram, Loader2, Play, RotateCcw } from "lucide-react";

type ViewItem = {
  media_type: string;
  playback_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  title?: string | null;
  source_url?: string | null;
};

/** Builds Instagram's official embed URL (same one their embed.js uses) from any saved Reel/post link. */
function instagramEmbedUrl(item: ViewItem) {
  const src = item.source_url || item.playback_url;
  const m = src.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/p/${m[1]}/embed/captioned/` : item.playback_url;
}

function instagramCover(item: ViewItem) {
  if (item.thumbnail_url) return item.thumbnail_url;
  if (item.media_type === "image") return item.playback_url;
  return null;
}

/** In-app message only — never links to or opens Instagram. */
function InstagramFallback({ item, onRetry }: { item: ViewItem; onRetry: () => void }) {
  const cover = instagramCover(item);
  return (
    <div className="flex flex-col items-center gap-3 p-4 text-center">
      <div className="relative aspect-[9/16] w-full max-w-[min(240px,calc((50vh)*9/16))] overflow-hidden rounded-2xl border border-border bg-muted">
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="brand-gradient grid size-full place-items-center text-primary-foreground">
            <Instagram className="size-8" />
          </div>
        )}
      </div>
      <p className="max-w-xs text-sm font-medium">
        This Instagram Reel cannot be played inside the website because Instagram has restricted embedded playback on
        this device/browser.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
      >
        <RotateCcw className="size-4" /> Try again
      </button>
    </div>
  );
}

function InstagramPlayer({ item, alt }: { item: ViewItem; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState<number>(0);
  const loads = useRef<number>(0);
  useEffect(() => {
    loads.current = 0;
    // Never spin forever: if Instagram's player hasn't loaded in 12s, show the in-app message.
    const t = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), 12000);
    return () => clearTimeout(t);
  }, [attempt]);
  if (state === "failed") {
    return (
      <InstagramFallback
        item={item}
        onRetry={() => {
          setState("loading");
          setAttempt((a) => a + 1);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 bg-background p-2">
      <div className="relative aspect-[9/16] w-full max-w-[min(340px,calc((70vh)*9/16))] overflow-hidden rounded-2xl border border-border bg-muted">
        {state === "loading" && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {/* Sandboxed: no popups and no top-level navigation, so Instagram can never open a new tab
            or replace this page. If the player tries to navigate itself (a second load), Instagram
            has refused in-site playback, and we show the in-app message instead. */}
        <iframe
          key={attempt}
          src={instagramEmbedUrl(item)}
          title={alt}
          className="absolute inset-0 size-full"
          scrolling="no"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          onLoad={() => {
            loads.current += 1;
            setState(loads.current > 1 ? "failed" : "ready");
          }}
          onError={() => setState("failed")}
        />
      </div>
      <button
        type="button"
        onClick={() => setState("failed")}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Seeing “Watch on Instagram”? Tap here
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

const IG_POST_RE = /instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/[A-Za-z0-9_-]+/;

/** Renders a stored file, or an official embedded player for platforms like YouTube / Instagram. */
export function MediaView({ item, mode, controls }: { item: ViewItem; mode: "thumb" | "player"; controls?: boolean }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const alt = item.caption ?? item.title ?? "Media";
  // Older imports stored only an Instagram Reel's still cover picture. In the popup, play the
  // original Reel through Instagram's official player instead of showing the still image.
  if (mode === "player" && item.media_type === "image" && item.source_url && IG_POST_RE.test(item.source_url)) {
    return <InstagramPlayer item={item} alt={alt} />;
  }
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

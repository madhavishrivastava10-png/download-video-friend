type ViewItem = {
  media_type: string;
  playback_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  title?: string | null;
};

/** Renders a stored file, or an official embedded player for platforms like YouTube. */
export function MediaView({ item, mode, controls }: { item: ViewItem; mode: "thumb" | "player"; controls?: boolean }) {
  const alt = item.caption ?? item.title ?? "Media";
  if (item.media_type === "embed") {
    if (mode === "thumb") {
      return item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt={alt} className="size-full object-cover" loading="lazy" />
      ) : (
        <div className="size-full bg-muted" />
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

export async function downloadMedia(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch the file for download.");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

export function mediaFilename(caption: string | null | undefined, mediaType: string): string {
  const base = (caption ?? "reel-grid-media")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "reel-grid-media";
  return `${base}.${mediaType === "image" ? "jpg" : "mp4"}`;
}

export const EMBED_NO_DOWNLOAD =
  "YouTube does not allow downloading its videos. This one plays in your grid through YouTube's official player.";

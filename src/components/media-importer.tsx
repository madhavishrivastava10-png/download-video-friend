import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, Link2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkMediaUrl, importMediaFromUrl } from "@/lib/media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Preview = {
  url: string;
  mediaType: "video" | "image" | "embed";
  contentType: string;
  size: number | null;
  suggestedTitle: string;
  note?: string;
};

export function MediaImporter() {
  const qc = useQueryClient();
  const check = useServerFn(checkMediaUrl);
  const save = useServerFn(importMediaFromUrl);
  const [url, setUrl] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [designId, setDesignId] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "saving">("idle");
  const [saved, setSaved] = useState<{ designId: string; title: string } | null>(null);

  const { data: designs } = useQuery({
    queryKey: ["designs", "all-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("designs")
        .select("id, title")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const target = designId || designs?.[0]?.id || "";

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreview(null);
    setSaved(null);
    if (!url.trim()) {
      setError("Paste a link first.");
      return;
    }
    setStatus("checking");
    try {
      const r = await check({ data: { url: url.trim() } });
      if (!r.ok) setError(r.message);
      else {
        setPreview(r);
        setTitle(r.suggestedTitle);
      }
    } catch {
      setError("Something went wrong while checking the link.");
    } finally {
      setStatus("idle");
    }
  }

  async function onSave() {
    if (!preview || !target) return;
    setStatus("saving");
    setError(null);
    try {
      const r = await save({ data: { designId: target, url: preview.url, title } });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSaved({ designId: target, title: r.item.title ?? "Media" });
      setPreview(null);
      setUrl("");
      toast.success("Saved to your grid");
      qc.invalidateQueries({ queryKey: ["media", target] });
      qc.invalidateQueries({ queryKey: ["designs"] });
    } catch {
      setError("Saving failed. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <section className="card-soft mt-8 p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold">Import media from a link</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste a direct file link (.mp4, .webm, .mov, .jpg, .png…). A permanent copy is saved to your grid.
      </p>
      <form onSubmit={onCheck} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Media URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/video.mp4"
            className="h-12 rounded-xl pl-9"
          />
        </div>
        <Button type="submit" className="h-12 rounded-xl px-6" disabled={status !== "idle"}>
          {status === "checking" ? <Loader2 className="size-4 animate-spin" /> : null}
          {status === "checking" ? "Checking…" : "Preview"}
        </Button>
      </form>

      {error && (
        <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {saved && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
          <CheckCircle2 className="size-4 text-primary" />
          <span>"{saved.title}" was downloaded and saved.</span>
          <Link to="/design/$designId" params={{ designId: saved.designId }} className="font-semibold text-primary underline">
            Open grid
          </Link>
        </div>
      )}

      {preview && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-xl bg-muted">
            {preview.mediaType === "embed" ? (
              <iframe src={preview.url} title="Preview" className={preview.url.includes("instagram.com") ? "aspect-[9/16] w-full" : "aspect-video w-full"} allowFullScreen />
            ) : preview.mediaType === "video" ? (
              <video src={preview.url} controls muted playsInline className="aspect-[9/16] w-full object-cover" />
            ) : (
              <img src={preview.url} alt="Preview" className="aspect-[9/16] w-full object-cover" />
            )}
          </div>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {preview.mediaType === "image" ? "Image" : "Video"} · {preview.contentType}
              {preview.size ? ` · ${(preview.size / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
            {preview.url.includes("instagram.com") && (
              <p className="text-xs text-muted-foreground">
                Instagram Reels are saved as a link and play through Instagram — the video is not downloaded.
              </p>
            )}
            {preview.note && <p className="text-xs text-muted-foreground">{preview.note}</p>}
            <label className="block text-sm font-semibold">
              Title
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 rounded-xl" />
            </label>
            <label className="block text-sm font-semibold">
              Save to grid
              {designs && designs.length > 0 ? (
                <select
                  aria-label="Target grid"
                  value={target}
                  onChange={(e) => setDesignId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {designs.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 text-xs font-normal text-muted-foreground">
                  You have no grids yet. <Link to="/create" className="text-primary underline">Create one</Link> first.
                </p>
              )}
            </label>
            <Button onClick={onSave} disabled={!target || status !== "idle"} className="rounded-xl">
              {status === "saving" ? <Loader2 className="size-4 animate-spin" /> : null}
              {status === "saving" ? "Downloading & saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

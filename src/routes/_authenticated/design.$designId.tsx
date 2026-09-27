import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Code2,
  Copy,
  Link2,
  Loader2,
  Play,
  Plus,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { importMediaFromUrl } from "@/lib/media.functions";
import { signMedia, type PlayableMedia } from "@/lib/reel-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlatformBadge } from "@/components/platform-badge";

export const Route = createFileRoute("/_authenticated/design/$designId")({
  head: () => ({
    meta: [
      { title: "Grid editor — Reel Grid" },
      { name: "description", content: "Add videos to your grid, reorder them and publish a share link." },
      { property: "og:title", content: "Grid editor — Reel Grid" },
      { property: "og:description", content: "Add videos to your grid and publish a share link." },
    ],
  }),
  component: GridEditor,
});

function GridEditor() {
  const { designId } = Route.useParams();
  const queryClient = useQueryClient();
  const importUrl = useServerFn(importMediaFromUrl);

  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [active, setActive] = useState<PlayableMedia | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const { data: design } = useQuery({
    queryKey: ["design", designId],
    queryFn: async () => {
      const { data, error } = await supabase.from("designs").select("*").eq("id", designId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: media } = useQuery({
    queryKey: ["media", designId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_items")
        .select("*")
        .eq("design_id", designId)
        .order("position", { ascending: true });
      if (error) throw error;
      return signMedia(data);
    },
  });

  const items = media ?? [];
  const cols = Math.min(design?.grid_cols ?? 3, 6);
  const totalSlots =
    design?.layout_mode === "fixed" ? (design.grid_rows ?? 0) * cols : items.length + 1;
  const emptySlots = Math.max(0, totalSlots - items.length);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["media", designId] });
    queryClient.invalidateQueries({ queryKey: ["designs"] });
  }

  async function handleUrlAdd() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await importUrl({ data: { designId, url: url.trim(), position: items.length } });
      toast.success("Saved — a permanent copy is now stored in your grid.");
      setUrl("");
      setAddOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that link.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File, replaceItem?: PlayableMedia) {
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${uid}/${designId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const payload = {
        media_type: file.type.startsWith("image/") ? "image" : "video",
        platform: "upload",
        storage_path: path,
        media_url: path,
      };

      if (replaceItem) {
        if (replaceItem.storage_path) {
          await supabase.storage.from("media").remove([replaceItem.storage_path]);
        }
        const { error } = await supabase.from("media_items").update(payload).eq("id", replaceItem.id);
        if (error) throw error;
        setActive(null);
      } else {
        const { error } = await supabase.from("media_items").insert({
          ...payload,
          design_id: designId,
          user_id: uid,
          position: items.length,
        });
        if (error) throw error;
      }
      toast.success("Media saved to your grid");
      setAddOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: PlayableMedia) {
    if (item.storage_path) await supabase.storage.from("media").remove([item.storage_path]);
    const { error } = await supabase.from("media_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setActive(null);
    toast.success("Removed");
    refresh();
  }

  async function saveCaption(item: PlayableMedia, caption: string) {
    const { error } = await supabase.from("media_items").update({ caption }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setActive(null);
    refresh();
  }

  async function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const list = [...items];
    const from = list.findIndex((i) => i.id === dragId);
    const to = list.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved!);
    setDragId(null);
    await Promise.all(
      list.map((item, index) => supabase.from("media_items").update({ position: index }).eq("id", item.id)),
    );
    refresh();
  }

  async function togglePublic(next: boolean) {
    const { error } = await supabase.from("designs").update({ is_public: next }).eq("id", designId);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["design", designId] });
  }

  const shareUrl =
    typeof window !== "undefined" && design?.share_slug
      ? `${window.location.origin}/share/${design.share_slug}`
      : "";

  return (
    <div className="mx-auto max-w-5xl">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold sm:text-2xl">
            {design?.title ?? "Loading..."}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} · saved permanently in your storage
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setShareOpen(true)}>
            <Share2 className="size-4" /> Share
          </Button>
          <Button className="rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add media
          </Button>
        </div>
      </header>

      <div
        className="mt-6 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(item.id)}
            onClick={() => setActive(item)}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm transition-transform hover:-translate-y-1"
          >
            {item.media_type === "image" ? (
              <img src={item.playback_url} alt={item.caption ?? "Media"} className="size-full object-cover" />
            ) : (
              <video src={`${item.playback_url}#t=0.1`} className="size-full object-cover" muted playsInline preload="metadata" />
            )}
            <span className="absolute left-2 top-2">
              <PlatformBadge platform={item.platform} />
            </span>
            {item.media_type === "video" && (
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid size-10 place-items-center rounded-full bg-foreground/45 text-background backdrop-blur-sm">
                  <Play className="size-4" fill="currentColor" />
                </span>
              </span>
            )}
          </button>
        ))}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            onClick={() => setAddOpen(true)}
            className="grid aspect-[3/4] place-items-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-6" />
          </button>
        ))}
      </div>

      {/* Add media */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4" /> Add media
            </DialogTitle>
            <DialogDescription>
              Paste a direct video file link (ending in .mp4, .webm or .mov) or upload a file you own.
              We store a real copy, so it keeps playing even if the original is deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="media-url">Video file link</Label>
            <div className="flex gap-2">
              <Input
                id="media-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://.../video.mp4"
                className="h-11 rounded-xl"
              />
              <Button onClick={handleUrlAdd} disabled={busy} className="h-11 rounded-xl">
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          </div>

          <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="secondary"
            className="h-11 rounded-xl"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> Upload from this device
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = "";
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Player */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Media</DialogTitle>
            <DialogDescription>Play, caption, replace or delete this item.</DialogDescription>
          </DialogHeader>
          {active && (
            <PlayerBody
              item={active}
              busy={busy}
              onDelete={() => removeItem(active)}
              onReplace={() => replaceRef.current?.click()}
              onSave={(caption) => saveCaption(active, caption)}
            />
          )}
          <input
            ref={replaceRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && active) uploadFile(file, active);
              e.target.value = "";
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Share */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share / publish</DialogTitle>
            <DialogDescription>Publish this grid to get a public page anyone can open.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
            <span className="text-sm font-medium">{design?.is_public ? "Public" : "Private"}</span>
            <Switch checked={!!design?.is_public} onCheckedChange={togglePublic} />
          </div>

          {design?.is_public && (
            <div className="space-y-2">
              <ShareRow icon={<Copy className="size-4" />} label="Copy link" value={shareUrl} />
              <ShareRow
                icon={<Code2 className="size-4" />}
                label="Copy embed code"
                value={`<iframe src="${shareUrl}" width="100%" height="720" style="border:0"></iframe>`}
              />
              <Button asChild variant="ghost" className="w-full rounded-xl">
                <Link to="/share/$slug" params={{ slug: design.share_slug ?? "" }} target="_blank">
                  Open public page
                </Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShareRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success("Copied");
        setTimeout(() => setDone(false), 1500);
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm font-medium hover:bg-accent/60"
    >
      {done ? <Check className="size-4 text-primary" /> : icon}
      {label}
    </button>
  );
}

function PlayerBody({
  item,
  busy,
  onDelete,
  onReplace,
  onSave,
}: {
  item: PlayableMedia;
  busy: boolean;
  onDelete: () => void;
  onReplace: () => void;
  onSave: (caption: string) => void;
}) {
  const [caption, setCaption] = useState(item.caption ?? "");
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-foreground/90">
        {item.media_type === "image" ? (
          <img src={item.playback_url} alt={item.caption ?? "Media"} className="max-h-80 w-full object-contain" />
        ) : (
          <video src={item.playback_url} controls className="max-h-80 w-full" />
        )}
      </div>
      <Textarea
        value={caption}
        maxLength={500}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Add your text here..."
        className="min-h-20 rounded-xl"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onDelete} disabled={busy}>
          <Trash2 className="size-4" /> Delete
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={onReplace} disabled={busy}>
          <Upload className="size-4" /> Replace
        </Button>
        <Button className="rounded-xl" onClick={() => onSave(caption)} disabled={busy}>
          Save
        </Button>
      </div>
    </div>
  );
}

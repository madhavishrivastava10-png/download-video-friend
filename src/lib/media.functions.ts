import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 200 * 1024 * 1024;

type ImportInput = { designId: string; url: string; position: number; caption?: string };

function guessExtension(contentType: string, url: string) {
  const fromUrl = url.split("?")[0]?.split(".").pop()?.toLowerCase();
  if (fromUrl && fromUrl.length <= 4 && /^[a-z0-9]+$/.test(fromUrl)) return fromUrl;
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Downloads a direct media file (mp4/webm/mov/jpg/png/gif) and stores a permanent
 * copy in the user's private storage, so the grid keeps working even if the
 * original link is deleted.
 */
export const importMediaFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let parsed: URL;
    try {
      parsed = new URL(data.url);
    } catch {
      throw new Error("That does not look like a valid link.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only http and https links are supported.");
    }

    const res = await fetch(parsed.toString(), {
      headers: { "user-agent": "ReelGrid/1.0", accept: "video/*,image/*;q=0.9,*/*;q=0.5" },
      redirect: "follow",
    });

    if (!res.ok || !res.body) {
      throw new Error(`Could not fetch that link (status ${res.status}).`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isVideo = contentType.startsWith("video/");
    const isImage = contentType.startsWith("image/");
    if (!isVideo && !isImage) {
      throw new Error(
        "This link is a web page, not a video file. Paste a direct video file link (ending in .mp4) or upload the file instead.",
      );
    }

    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error("That file is larger than 200 MB.");
    }

    const ext = guessExtension(contentType, parsed.pathname);
    const path = `${userId}/${data.designId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, buffer, { contentType: contentType || "application/octet-stream", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: row, error } = await supabase
      .from("media_items")
      .insert({
        design_id: data.designId,
        user_id: userId,
        position: data.position,
        media_type: isVideo ? "video" : "image",
        platform: detectPlatform(parsed.hostname),
        storage_path: path,
        media_url: path,
        source_url: data.url,
        caption: data.caption ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return row;
  });

function detectPlatform(hostname: string) {
  const h = hostname.toLowerCase();
  if (h.includes("instagram") || h.includes("cdninstagram")) return "instagram";
  if (h.includes("youtube") || h.includes("ytimg") || h.includes("youtu.be")) return "youtube";
  if (h.includes("snapchat") || h.includes("sc-cdn")) return "snapchat";
  return "upload";
}

/** Public, read-only fetch of a published grid plus temporary playback links. */
export const getPublicDesign = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string; password?: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: design } = await supabaseAdmin
      .from("designs")
      .select("*")
      .eq("share_slug", data.slug)
      .eq("is_public", true)
      .maybeSingle();

    if (!design) return { status: "not_found" as const };

    if (design.password_protected && design.share_password && design.share_password !== data.password) {
      return { status: "locked" as const, title: design.title };
    }

    const { data: items } = await supabaseAdmin
      .from("media_items")
      .select("*")
      .eq("design_id", design.id)
      .order("position", { ascending: true });

    const media = await Promise.all(
      (items ?? []).map(async (item) => {
        let url = item.media_url;
        if (item.storage_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("media")
            .createSignedUrl(item.storage_path, 60 * 60 * 6);
          url = signed?.signedUrl ?? url;
        }
        return { ...item, playback_url: url };
      }),
    );

    let owner: { display_name: string | null; avatar_url: string | null; bio: string | null } | null = null;
    if (design.show_bio) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, avatar_url, bio")
        .eq("id", design.user_id)
        .maybeSingle();
      owner = profile ?? null;
    }

    return {
      status: "ok" as const,
      design: {
        id: design.id,
        title: design.title,
        grid_cols: design.grid_cols,
        show_bio: design.show_bio,
        show_highlights: design.show_highlights,
        created_at: design.created_at,
      },
      media,
      owner,
    };
  });

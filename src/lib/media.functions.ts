import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 200 * 1024 * 1024;

type ImportInput = { designId: string; url: string; position?: number; caption?: string; title?: string };

const PAGE_HOSTS = [
  "instagram.com", "youtube.com", "youtu.be", "tiktok.com", "snapchat.com", "facebook.com",
  "fb.watch", "x.com", "twitter.com", "vimeo.com", "pinterest.com", "threads.net", "reddit.com",
];

export function isPageHost(hostname: string) {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return PAGE_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

function isPrivateHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "[::1]") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

type Checked =
  | { ok: false; message: string }
  | { ok: true; url: URL; res: Response; contentType: string; isVideo: boolean; size: number | null; pageUrl?: URL };

const RESTRICTED =
  "Unable to import this URL. The media may be private, unavailable, unsupported, or restricted.";

function decodeHtml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key.replace(/:/g, "\\:")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const c = tag.match(/content=["']([^"']+)["']/i)?.[1];
  return c ? decodeHtml(c) : null;
}

/** Finds a publicly published media file on a web page (Open Graph / <video> tags). */
function findMediaInPage(html: string, base: URL): string | null {
  const candidates = [
    metaContent(html, "og:video:secure_url"),
    metaContent(html, "og:video:url"),
    metaContent(html, "og:video"),
    metaContent(html, "twitter:player:stream"),
    html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1],
    html.match(/<source[^>]+src=["']([^"']+)["'][^>]*type=["']video/i)?.[1],
  ];
  const ogType = metaContent(html, "og:type") ?? "";
  if (!ogType.includes("video")) candidates.push(metaContent(html, "og:image:secure_url"), metaContent(html, "og:image"));
  for (const c of candidates) {
    if (!c) continue;
    try {
      const u = new URL(decodeHtml(c), base);
      if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
    } catch { /* skip */ }
  }
  return null;
}

async function fetchUrl(url: URL): Promise<Response | null> {
  try {
    return await fetch(url.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ReelGrid/1.0; +https://lovable.app)",
        accept: "video/*,image/*,text/html;q=0.8,*/*;q=0.5",
      },
      redirect: "follow",
    });
  } catch {
    return null;
  }
}

/**
 * Validates a URL and opens the media behind it. Accepts direct media files or
 * public web pages that openly publish their media (Open Graph / <video> tags).
 * Never bypasses logins, private accounts or DRM.
 */
async function openMediaUrl(raw: string, depth = 0): Promise<Checked> {
  const fail = (message: string) => ({ ok: false as const, message });
  if (!raw.trim()) return fail("Please paste a link first.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return fail("That does not look like a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fail("Only http and https links are supported.");
  if (isPrivateHost(url.hostname)) return fail("Private or local network addresses are not allowed.");

  const res = await fetchUrl(url);
  if (!res) return fail("Network error: we could not reach that link. Check it and try again.");
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410) {
    await res.body?.cancel();
    return fail(RESTRICTED);
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    return fail(`${RESTRICTED} (status ${res.status})`);
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0]!.trim();
  const isVideo = contentType.startsWith("video/");
  const isImage = contentType.startsWith("image/");

  if (!isVideo && !isImage) {
    if (depth > 0 || !contentType.includes("html")) {
      await res.body.cancel();
      return fail(RESTRICTED);
    }
    const html = (await res.text()).slice(0, 2_000_000);
    const found = findMediaInPage(html, new URL(res.url || url.toString()));
    if (!found) return fail(RESTRICTED);
    const inner = await openMediaUrl(found, depth + 1);
    if (!inner.ok) return inner;
    return { ...inner, pageUrl: url };
  }

  const len = Number(res.headers.get("content-length"));
  const size = Number.isFinite(len) && len > 0 ? len : null;
  if (size && size > MAX_BYTES) {
    await res.body.cancel();
    return fail("That file is larger than 200 MB.");
  }
  return { ok: true, url, res, contentType, isVideo, size };
}

function titleFromUrl(url: URL) {
  const name = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  return name.replace(/[-_]+/g, " ").trim().slice(0, 120) || "Imported media";
}

/** Checks a link without saving anything; used for the preview step. */
export const checkMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (typeof input?.url !== "string" || input.url.length > 2048) throw new Error("Invalid link");
    return input;
  })
  .handler(async ({ data }) => {
    const r = await openMediaUrl(data.url);
    if (!r.ok) return r;
    await r.res.body?.cancel();
    return {
      ok: true as const,
      url: r.url.toString(),
      mediaType: r.isVideo ? ("video" as const) : ("image" as const),
      contentType: r.contentType,
      size: r.size,
      suggestedTitle: titleFromUrl(r.url),
      platform: detectPlatform((r.pageUrl ?? r.url).hostname),
    };
  });

/**
 * Downloads a direct media file and stores a permanent copy in the user's
 * private storage, so the grid keeps working even if the original is deleted.
 */
export const importMediaFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInput) => {
    if (typeof input?.url !== "string" || input.url.length > 2048) throw new Error("Invalid link");
    if (typeof input.designId !== "string") throw new Error("Invalid grid");
    return { ...input, title: input.title?.slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fail = (message: string) => ({ ok: false as const, message });

    const { data: design } = await supabase.from("designs").select("id").eq("id", data.designId).maybeSingle();
    if (!design) return fail("That grid was not found.");

    const r = await openMediaUrl(data.url);
    if (!r.ok) return r;

    const buffer = new Uint8Array(await r.res.arrayBuffer());
    if (buffer.byteLength === 0) return fail("That file is empty.");
    if (buffer.byteLength > MAX_BYTES) return fail("That file is larger than 200 MB.");

    let position = data.position;
    if (position === undefined) {
      const { data: last } = await supabase
        .from("media_items").select("position").eq("design_id", data.designId)
        .order("position", { ascending: false }).limit(1).maybeSingle();
      position = last ? last.position + 1 : 0;
    }

    const ext = guessExtension(r.contentType, r.url.pathname);
    const path = `${userId}/${data.designId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, buffer, { contentType: r.contentType, upsert: false });
    if (uploadError) return fail(uploadError.message);

    const { data: row, error } = await supabase
      .from("media_items")
      .insert({
        design_id: data.designId,
        user_id: userId,
        position,
        media_type: r.isVideo ? "video" : "image",
        platform: detectPlatform((r.pageUrl ?? r.url).hostname),
        storage_path: path,
        media_url: path,
        source_url: (r.pageUrl ?? r.url).toString(),
        caption: data.caption ?? null,
        title: data.title?.trim() || titleFromUrl(r.url),
        thumbnail_url: r.isVideo ? null : path,
        content_type: r.contentType,
        file_size: buffer.byteLength,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from("media").remove([path]);
      return fail(error.message);
    }
    await supabase.from("designs").update({ updated_at: new Date().toISOString() }).eq("id", data.designId);
    return { ok: true as const, item: row };
  });

function guessExtension(contentType: string, path: string) {
  const fromUrl = path.split(".").pop()?.toLowerCase();
  if (fromUrl && fromUrl.length <= 4 && /^[a-z0-9]+$/.test(fromUrl) && fromUrl !== path.toLowerCase()) return fromUrl;
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return contentType.startsWith("video/") ? "mp4" : "jpg";
}

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

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
    return await fetchWithBackoff(url.toString(), {
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
  if (res.status === 429) {
    await res.body?.cancel();
    return fail("That site is rate-limiting requests right now (429). Please wait a minute and try again.");
  }
  if (res.status >= 500) {
    await res.body?.cancel();
    return fail(`That site is temporarily unavailable (status ${res.status}). Please try again later.`);
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

// ---------- YouTube (official oEmbed + embedded player; no downloading) ----------
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the video id from any common YouTube URL shape, or null. */
export function parseYouTubeId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (h === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[2] ?? null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

type YouTubeInfo =
  | { ok: false; message: string }
  | { ok: true; id: string; watchUrl: string; embedUrl: string; title: string; thumbnail: string; author: string | null };

const ytCache = new Map<string, { at: number; value: YouTubeInfo }>();

async function fetchWithBackoff(url: string, init: RequestInit, tries = 3): Promise<Response | null> {
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try { res = await fetch(url, init); } catch { if (i === tries - 1) return null; await sleep(400 * 2 ** i); continue; }
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      await res.body?.cancel();
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) * 1000 : 500 * 2 ** i);
      continue;
    }
    return res;
  }
  return null;
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** Verifies a YouTube video is public and embeddable via YouTube's official oEmbed endpoint. */
async function resolveYouTube(id: string): Promise<YouTubeInfo> {
  const hit = ytCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  const res = await fetchWithBackoff(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
    { headers: { accept: "application/json" } },
  );
  let value: YouTubeInfo;
  if (!res) value = { ok: false, message: "Temporary network problem reaching YouTube. Please try again in a moment." };
  else if (res.status === 429) value = { ok: false, message: "YouTube is rate-limiting requests right now (429). Please wait a minute and try again." };
  else if (res.status === 401 || res.status === 403) value = { ok: false, message: "This YouTube video is private or its owner has disabled embedding, so it can't be added." };
  else if (res.status === 404 || res.status === 400) value = { ok: false, message: "This YouTube video is unavailable or has been removed." };
  else if (!res.ok) value = { ok: false, message: `YouTube is temporarily unavailable (status ${res.status}). Please try again.` };
  else {
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    value = {
      ok: true, id, watchUrl,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      title: (j.title ?? "YouTube video").slice(0, 200),
      thumbnail: j.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      author: j.author_name ?? null,
    };
  }
  if (res) await res.body?.cancel().catch(() => {});
  // Cache successes and hard failures; don't cache transient ones.
  if (value.ok || (res && [401, 403, 404, 400].includes(res.status))) ytCache.set(id, { at: Date.now(), value });
  return value;
}

// ---------- Instagram (official embed player; no downloading) ----------
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;

/** Extracts {kind, code} from Instagram reel/post URLs, or null. */
export function parseInstagram(raw: string): { kind: "reel" | "p" | "tv"; code: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (h !== "instagram.com" && h !== "instagr.am") return null;
  const m = u.pathname.match(/^\/(?:[^/]+\/)?(reels?|p|tv)\/([^/?#]+)/);
  if (!m || !IG_CODE.test(m[2]!)) return null;
  const kind = m[1] === "p" ? "p" : m[1] === "tv" ? "tv" : "reel";
  return { kind, code: m[2]! };
}

/** Canonical, tracking-free Instagram links for a parsed post. */
function instagramUrls(p: { kind: string; code: string }) {
  return {
    watchUrl: `https://www.instagram.com/${p.kind}/${p.code}/`,
    embedUrl: `https://www.instagram.com/${p.kind}/${p.code}/embed/`,
  };
}

/**
 * Result of the optional cover/metadata lookup. Only "gone" and "blocked" stop
 * an import; "unavailable" (rate limit, network, Instagram refusing servers)
 * still saves the Reel as a link card that plays through Instagram's player.
 */
type IgMeta =
  | { status: "ok"; thumbnail: string | null }
  | { status: "gone" }
  | { status: "blocked" }
  | { status: "unavailable"; retryAfterSec: number };

const igCache = new Map<string, { until: number; value: IgMeta }>();
/** Global pause after Instagram answers 429, so we never hammer it. */
let igCooldownUntil = 0;

const IG_GONE = "This Instagram Reel is unavailable or has been deleted.";
const IG_BLOCKED = "This Instagram Reel can't be embedded — the account may be private, or the owner turned off embedding.";

/**
 * One single request to Instagram's official embed page (no retries, short
 * timeout). Results are cached so preview + save never ask twice.
 */
async function fetchInstagramMeta(p: { kind: string; code: string }): Promise<IgMeta> {
  const key = `${p.kind}/${p.code}`;
  const now = Date.now();
  const hit = igCache.get(key);
  if (hit && now < hit.until) {
    if (hit.value.status === "unavailable") {
      return { status: "unavailable", retryAfterSec: Math.max(1, Math.ceil((hit.until - now) / 1000)) };
    }
    return hit.value;
  }
  if (now < igCooldownUntil) {
    return { status: "unavailable", retryAfterSec: Math.ceil((igCooldownUntil - now) / 1000) };
  }

  const { embedUrl } = instagramUrls(p);
  let res: Response | null = null;
  try {
    res = await fetch(process.env["IG_TEST_URL"] ?? embedUrl, { // TEMP_TEST
      headers: { "user-agent": "Mozilla/5.0 (compatible; ReelGrid/1.0)", accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    res = null;
  }

  let value: IgMeta;
  let ttlMs: number;
  if (!res) {
    value = { status: "unavailable", retryAfterSec: 30 };
    ttlMs = 30_000;
  } else if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    const sec = Number.isFinite(ra) && ra > 0 ? Math.min(Math.max(ra, 60), 900) : 120;
    igCooldownUntil = now + sec * 1000;
    value = { status: "unavailable", retryAfterSec: sec };
    ttlMs = sec * 1000;
  } else if (res.status === 404 || res.status === 410) {
    value = { status: "gone" };
    ttlMs = 30 * 60_000;
  } else if (!res.ok) {
    value = { status: "unavailable", retryAfterSec: 60 };
    ttlMs = 60_000;
  } else {
    const html = (await res.text()).slice(0, 1_000_000);
    const img =
      html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/i)?.[1] ??
      html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src="([^"]+)"/i)?.[1];
    if (!img && /This (post|reel|content) is(n't| not) available|private account|Sorry, this page isn/i.test(html)) {
      value = { status: "blocked" };
    } else {
      value = { status: "ok", thumbnail: img ? decodeHtml(img) : null };
    }
    ttlMs = 30 * 60_000;
  }
  if (res && !res.bodyUsed) await res.body?.cancel().catch(() => {});
  igCache.set(key, { until: now + ttlMs, value });
  return value;
}

/** Checks a link without saving anything; used for the preview step. */
export const checkMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (typeof input?.url !== "string" || input.url.length > 2048) throw new Error("Invalid link");
    return input;
  })
  .handler(async ({ data }) => {
    const ytId = parseYouTubeId(data.url);
    if (ytId) {
      const y = await resolveYouTube(ytId);
      if (!y.ok) return y;
      return {
        ok: true as const, url: y.embedUrl, mediaType: "embed" as const, contentType: "YouTube video",
        size: null, suggestedTitle: y.title, platform: "youtube",
      };
    }
    const ig = parseInstagram(data.url);
    if (ig) {
      const meta = await fetchInstagramMeta(ig);
      if (meta.status === "gone") return { ok: false as const, message: IG_GONE };
      if (meta.status === "blocked") return { ok: false as const, message: IG_BLOCKED };
      return {
        ok: true as const, url: instagramUrls(ig).embedUrl, mediaType: "embed" as const, contentType: "Instagram Reel",
        size: null, suggestedTitle: ig.kind === "p" ? "Instagram post" : "Instagram Reel", platform: "instagram",
        note: meta.status === "unavailable"
          ? "Instagram didn't share the cover picture right now. It will be saved as a link card that plays through Instagram — you can retry the cover later."
          : undefined,
      };
    }
    if (/(^|\.)instagram\.com$/i.test((() => { try { return new URL(data.url.trim()).hostname; } catch { return ""; } })())) {
      return { ok: false as const, message: "Invalid Instagram link. Paste a Reel or post link like https://www.instagram.com/reel/…/" };
    }
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

    let position = data.position;
    if (position === undefined) {
      const { data: last } = await supabase
        .from("media_items").select("position").eq("design_id", data.designId)
        .order("position", { ascending: false }).limit(1).maybeSingle();
      position = last ? last.position + 1 : 0;
    }

    const ytId = parseYouTubeId(data.url);
    if (ytId) {
      const y = await resolveYouTube(ytId);
      if (!y.ok) return y;
      const { data: row, error } = await supabase.from("media_items").insert({
        design_id: data.designId, user_id: userId, position,
        media_type: "embed", platform: "youtube", storage_path: null,
        media_url: y.embedUrl, source_url: y.watchUrl, caption: data.caption ?? null,
        title: data.title?.trim() || y.title, thumbnail_url: y.thumbnail, content_type: "video/youtube",
      }).select().single();
      if (error) return fail("Could not save to your grid. Please try again.");
      await supabase.from("designs").update({ updated_at: new Date().toISOString() }).eq("id", data.designId);
      return { ok: true as const, item: row };
    }

    const ig = parseInstagram(data.url);
    if (ig) {
      // Never downloads the Reel. At most one cached metadata request; if
      // Instagram is busy we still save the link and show a clean card.
      const meta = await fetchInstagramMeta(ig);
      if (meta.status === "gone") return fail(IG_GONE);
      if (meta.status === "blocked") return fail(IG_BLOCKED);
      const { watchUrl, embedUrl } = instagramUrls(ig);
      const { data: row, error } = await supabase.from("media_items").insert({
        design_id: data.designId, user_id: userId, position,
        media_type: "embed", platform: "instagram", storage_path: null,
        media_url: embedUrl, source_url: watchUrl, caption: data.caption ?? null,
        title: data.title?.trim() || (ig.kind === "p" ? "Instagram post" : "Instagram Reel"),
        thumbnail_url: meta.status === "ok" ? meta.thumbnail : null,
        content_type: "video/instagram",
      }).select().single();
      if (error) return fail("Could not save to your grid. Please try again.");
      await supabase.from("designs").update({ updated_at: new Date().toISOString() }).eq("id", data.designId);
      return { ok: true as const, item: row, metadataPending: meta.status === "unavailable" };
    }

    const r = await openMediaUrl(data.url);
    if (!r.ok) return r;

    const buffer = new Uint8Array(await r.res.arrayBuffer());
    if (buffer.byteLength === 0) return fail("That file is empty.");
    if (buffer.byteLength > MAX_BYTES) return fail("That file is larger than 200 MB.");

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

/**
 * Retries the Instagram cover lookup for a saved Reel. Respects the global
 * cooldown, so repeated clicks never turn into repeated requests.
 */
export const refreshInstagramCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string }) => {
    if (typeof input?.itemId !== "string" || input.itemId.length > 64) throw new Error("Invalid item");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: item } = await supabase
      .from("media_items").select("id, platform, source_url, media_url").eq("id", data.itemId).maybeSingle();
    if (!item || item.platform !== "instagram") return { ok: false as const, message: "That Instagram item was not found." };
    const ig = parseInstagram(item.source_url ?? item.media_url.replace(/\/embed\/?$/, "/"));
    if (!ig) return { ok: false as const, message: "This item has no valid Instagram link." };
    const meta = await fetchInstagramMeta(ig);
    if (meta.status === "gone") return { ok: false as const, message: IG_GONE };
    if (meta.status === "blocked") return { ok: false as const, message: IG_BLOCKED };
    if (meta.status === "unavailable") {
      return {
        ok: false as const,
        message: `Instagram is busy right now. Please try again in about ${meta.retryAfterSec} seconds.`,
        retryAfterSec: meta.retryAfterSec,
      };
    }
    if (!meta.thumbnail) return { ok: false as const, message: "Instagram didn't provide a cover picture for this Reel. It still plays normally." };
    const { error } = await supabase.from("media_items").update({ thumbnail_url: meta.thumbnail }).eq("id", item.id);
    if (error) return { ok: false as const, message: "Could not save the cover. Please try again." };
    return { ok: true as const, thumbnail: meta.thumbnail };
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

import { MediaView } from "@/components/media-view";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Lock, Play } from "lucide-react";
import { getPublicDesign } from "@/lib/media.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand";
import { PlatformBadge } from "@/components/platform-badge";

export const Route = createFileRoute("/share/$slug")({
  head: () => ({
    meta: [
      { title: "A shared grid — Reel Grid" },
      { name: "description", content: "A published collection of reels, videos and posts." },
      { property: "og:title", content: "A shared grid — Reel Grid" },
      { property: "og:description", content: "A published collection of reels, videos and posts." },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { slug } = Route.useParams();
  const fetchDesign = useServerFn(getPublicDesign);
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["share", slug, submitted],
    queryFn: () => fetchDesign({ data: { slug, password: submitted } }),
  });

  if (isLoading) {
    return <p className="page-gradient grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data || data.status === "not_found") {
    return (
      <div className="page-gradient grid min-h-screen place-items-center px-4 text-center">
        <div>
          <BrandLogo />
          <p className="mt-4 text-sm text-muted-foreground">This grid is not available.</p>
        </div>
      </div>
    );
  }

  if (data.status === "locked") {
    return (
      <div className="page-gradient grid min-h-screen place-items-center px-4">
        <div className="card-soft w-full max-w-sm p-7 text-center">
          <Lock className="mx-auto size-6 text-primary" />
          <h1 className="font-display mt-3 text-lg font-bold">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">This grid is password protected.</p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-4 h-11 rounded-xl"
            placeholder="Password"
          />
          <Button className="mt-3 w-full rounded-xl" onClick={() => setSubmitted(password)}>
            Open grid
          </Button>
        </div>
      </div>
    );
  }

  const cols = Math.min(data.design.grid_cols, 6);

  return (
    <div className="page-gradient min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <BrandLogo size={30} />
        <h1 className="font-display mt-5 text-2xl font-extrabold">{data.design.title}</h1>
        {data.owner && (data.owner.display_name || data.owner.bio) && (
          <div className="mt-2 text-sm text-muted-foreground">
            {data.owner.display_name && <p className="font-semibold text-foreground">{data.owner.display_name}</p>}
            {data.owner.bio && <p>{data.owner.bio}</p>}
          </div>
        )}

        <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {data.media.map((item) => (
            <figure
              key={item.id}
              className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-muted"
            >
              {item.media_type === "embed" ? <MediaView item={item} mode="player" /> : <MediaView item={item} mode="thumb" controls />}
              <span className="absolute left-2 top-2">
                <PlatformBadge platform={item.platform} />
              </span>
              {item.media_type === "video" && (
                <span className="pointer-events-none absolute right-2 top-2 text-background/90">
                  <Play className="size-4" fill="currentColor" />
                </span>
              )}
            </figure>
          ))}
        </div>

        {data.media.length === 0 && (
          <p className="card-soft mt-6 p-10 text-center text-sm text-muted-foreground">
            This grid is empty.
          </p>
        )}
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATES } from "@/lib/reel-grid";
import { Button } from "@/components/ui/button";
import { MediaImporter } from "@/components/media-importer";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Reel Grid" },
      { name: "description", content: "Create, organise and share your favourite reels and videos." },
      { property: "og:title", content: "Dashboard — Reel Grid" },
      { property: "og:description", content: "Create, organise and share your favourite reels." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: recent } = useQuery({
    queryKey: ["designs", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("designs")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
        Welcome back 👋
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create, organise and share your favourite reels, videos and posts.
      </p>

      <MediaImporter />

      <section className="card-soft mt-8 p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Start a new grid</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => (
            <Link
              key={t.id}
              to="/create"
              search={{ template: t.id }}
              className="group rounded-2xl border border-border bg-card p-3 transition-transform hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="brand-gradient grid aspect-[4/3] place-items-center rounded-xl text-primary-foreground opacity-90 group-hover:opacity-100">
                <span className="text-xs font-bold uppercase tracking-widest">
                  {t.rows}×{t.cols}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Recent designs</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/designs">See all</Link>
          </Button>
        </div>
        {recent && recent.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((d) => (
              <Link
                key={d.id}
                to="/design/$designId"
                params={{ designId: d.id }}
                className="card-soft p-4 transition-transform hover:-translate-y-1"
              >
                <p className="truncate text-sm font-bold">{d.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(d.updated_at).toLocaleDateString()} · {d.grid_rows}×{d.grid_cols}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card-soft mt-4 flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">No designs yet.</p>
            <Button asChild className="rounded-xl">
              <Link to="/create">
                <Plus className="size-4" /> Create your first grid
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

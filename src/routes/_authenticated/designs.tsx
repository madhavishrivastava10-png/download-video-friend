import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { slugify } from "@/lib/reel-grid";

export const Route = createFileRoute("/_authenticated/designs")({
  head: () => ({
    meta: [
      { title: "Recent designs — Reel Grid" },
      { name: "description", content: "All the grids you have created, ready to edit or share." },
      { property: "og:title", content: "Recent designs — Reel Grid" },
      { property: "og:description", content: "All the grids you have created." },
    ],
  }),
  component: DesignsPage,
});

function DesignsPage() {
  const [term, setTerm] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: designs } = useQuery({
    queryKey: ["designs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("designs")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (designs ?? []).filter((d) =>
    d.title.toLowerCase().includes(term.trim().toLowerCase()),
  );

  async function remove(id: string) {
    const { error } = await supabase.from("designs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Design deleted");
    queryClient.invalidateQueries({ queryKey: ["designs"] });
  }

  async function duplicate(id: string) {
    const source = (designs ?? []).find((d) => d.id === id);
    if (!source) return;
    const { id: _id, created_at: _c, updated_at: _u, share_slug: _s, ...rest } = source;
    const { data, error } = await supabase
      .from("designs")
      .insert({ ...rest, title: `${source.title} (copy)`, share_slug: slugify(source.title), is_public: false })
      .select()
      .single();
    if (error) return toast.error(error.message);

    const { data: items } = await supabase.from("media_items").select("*").eq("design_id", id);
    if (items?.length) {
      await supabase.from("media_items").insert(
        items.map(({ id: _mid, created_at: _mc, ...m }) => ({ ...m, design_id: data.id })),
      );
    }
    queryClient.invalidateQueries({ queryKey: ["designs"] });
    navigate({ to: "/design/$designId", params: { designId: data.id } });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-extrabold">Recent Designs</h1>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search designs..."
          className="h-11 rounded-xl pl-9"
        />
      </div>

      <div className="mt-5 space-y-3">
        {filtered.map((d) => (
          <div
            key={d.id}
            className="card-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4"
          >
            <div className="min-w-0">
              <Link
                to="/design/$designId"
                params={{ designId: d.id }}
                className="truncate text-sm font-bold hover:underline"
              >
                {d.title}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(d.updated_at).toLocaleDateString()} · {d.grid_rows}×{d.grid_cols} ·{" "}
                {d.is_public ? "Public" : "Private"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button asChild variant="ghost" size="icon" aria-label="Edit">
                <Link to="/design/$designId" params={{ designId: d.id }}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Duplicate" onClick={() => duplicate(d.id)}>
                <Copy className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(d.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="card-soft p-10 text-center text-sm text-muted-foreground">
            No designs found.
          </p>
        )}
      </div>
    </div>
  );
}

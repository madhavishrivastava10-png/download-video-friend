import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CONTENT_TYPES, PLATFORMS, TEMPLATES, slugify } from "@/lib/reel-grid";

type Search = { template?: string };

export const Route = createFileRoute("/_authenticated/create")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search['template'] === "string" ? { template: search['template'] as string } : {},
  head: () => ({
    meta: [
      { title: "Create a design — Reel Grid" },
      { name: "description", content: "Pick a layout, filters and privacy options for your new grid." },
      { property: "og:title", content: "Create a design — Reel Grid" },
      { property: "og:description", content: "Pick a layout and options for your new grid." },
    ],
  }),
  component: CreateWizard,
});

const steps = ["Title & Layout", "Filters", "Options"];

function CreateWizard() {
  const { template } = Route.useSearch();
  const navigate = useNavigate();
  const preset = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("My Instagram + YouTube Reels");
  const [layoutMode, setLayoutMode] = useState("fixed");
  const [rows, setRows] = useState<number>(preset.rows);
  const [cols, setCols] = useState<number>(preset.cols);
  const [platforms, setPlatforms] = useState<string[]>(["all"]);
  const [contentTypes, setContentTypes] = useState<string[]>(["all"]);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [password, setPassword] = useState("");
  const [showBio, setShowBio] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [busy, setBusy] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    if (id === "all") return setList(["all"]);
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list.filter((x) => x !== "all"), id];
    setList(next.length ? next : ["all"]);
  }

  async function create() {
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("designs")
        .insert({
          user_id: userId,
          title: title.trim() || "Untitled design",
          layout_mode: layoutMode,
          grid_rows: rows,
          grid_cols: cols,
          platforms,
          content_types: contentTypes,
          password_protected: passwordProtected,
          share_password: passwordProtected ? password : null,
          show_bio: showBio,
          show_highlights: showHighlights,
          template: preset.id,
          share_slug: slugify(title),
        })
        .select()
        .single();
      if (error) throw error;
      navigate({ to: "/design/$designId", params: { designId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the design.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card-soft p-5 sm:p-7">
        <h1 className="font-display text-xl font-extrabold">Create New Design</h1>

        <ol className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-bold",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className={cn(i === step ? "font-semibold text-primary" : "text-muted-foreground")}>
                {label}
              </span>
              {i < steps.length - 1 && <span className="hidden h-px w-6 bg-border sm:block" />}
            </li>
          ))}
        </ol>

        <div className="mt-7 space-y-6">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="title">Design title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-3">
                <Label>Rows / Columns</Label>
                {[
                  { id: "fixed", label: "Fixed (custom)" },
                  { id: "unlimited", label: "Unlimited rows + unlimited columns" },
                  { id: "unlimited-rows", label: "Unlimited rows + fixed columns" },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name="layout"
                      checked={layoutMode === opt.id}
                      onChange={() => setLayoutMode(opt.id)}
                      className="size-4 accent-[oklch(0.52_0.22_292)]"
                    />
                    {opt.label}
                  </label>
                ))}

                {layoutMode !== "unlimited" && (
                  <div className="flex flex-wrap items-end gap-4 rounded-xl bg-muted/60 p-4">
                    {layoutMode === "fixed" && (
                      <div className="space-y-1">
                        <Label className="text-xs">Rows</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={rows}
                          onChange={(e) => setRows(Number(e.target.value) || 1)}
                          className="h-10 w-24 rounded-lg"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Columns</Label>
                      <Input
                        type="number"
                        min={1}
                        max={6}
                        value={cols}
                        onChange={(e) => setCols(Math.min(6, Number(e.target.value) || 1))}
                        className="h-10 w-24 rounded-lg"
                      />
                    </div>
                    {layoutMode === "fixed" && (
                      <p className="pb-2 text-xs text-muted-foreground">Total boxes: {rows * cols}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Platform</Label>
                <div className="space-y-1 rounded-xl border border-border p-2">
                  {PLATFORMS.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/60"
                    >
                      <Checkbox
                        checked={platforms.includes(p.id)}
                        onCheckedChange={() => toggle(platforms, setPlatforms, p.id)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content type</Label>
                <div className="space-y-1 rounded-xl border border-border p-2">
                  {CONTENT_TYPES.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/60"
                    >
                      <Checkbox
                        checked={contentTypes.includes(c.id)}
                        onCheckedChange={() => toggle(contentTypes, setContentTypes, c.id)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-base font-bold">Privacy / display options</h2>
              <Row label="Password protection">
                <Switch checked={passwordProtected} onCheckedChange={setPasswordProtected} />
              </Row>
              {passwordProtected && (
                <div className="space-y-1.5">
                  <Label htmlFor="pw">Set password</Label>
                  <Input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}
              <Row label="Show bio">
                <Switch checked={showBio} onCheckedChange={setShowBio} />
              </Row>
              <Row label="Show highlights">
                <Switch checked={showHighlights} onCheckedChange={setShowHighlights} />
              </Row>
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < 2 ? (
            <Button className="rounded-xl" onClick={() => setStep((s) => s + 1)}>
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button className="rounded-xl" onClick={create} disabled={busy}>
              Create
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

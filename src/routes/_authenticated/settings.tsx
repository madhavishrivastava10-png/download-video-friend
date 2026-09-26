import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Reel Grid" },
      { name: "description", content: "Update your Reel Grid display name and bio." },
      { property: "og:title", content: "Settings — Reel Grid" },
      { property: "og:description", content: "Update your Reel Grid profile." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const id = userRes.user?.id;
      if (!id) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      return data;
    },
  });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, bio })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-extrabold">Settings</h1>
      <div className="card-soft mt-6 space-y-5 p-6">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={profile?.email ?? ""} disabled className="h-11 rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={300}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-24 rounded-xl"
          />
        </div>
        <Button onClick={save} disabled={busy} className="rounded-xl">
          Save changes
        </Button>
      </div>
    </div>
  );
}

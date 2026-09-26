import { Instagram, Upload, Youtube, Ghost } from "lucide-react";

export function PlatformBadge({ platform }: { platform: string }) {
  const Icon =
    platform === "instagram" ? Instagram : platform === "youtube" ? Youtube : platform === "snapchat" ? Ghost : Upload;
  return (
    <span className="grid size-6 place-items-center rounded-md bg-card/90 text-foreground shadow-sm">
      <Icon className="size-3.5" />
    </span>
  );
}

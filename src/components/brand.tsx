import { Play } from "lucide-react";

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="brand-gradient inline-flex items-center justify-center rounded-xl text-primary-foreground shadow-sm"
      style={{ width: size, height: size }}
    >
      <Play style={{ width: size * 0.45, height: size * 0.45 }} fill="currentColor" />
    </span>
  );
}

export function BrandLogo({ size = 36 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <BrandMark size={size} />
      <span className="font-display text-lg font-extrabold tracking-tight">Reel Grid</span>
    </span>
  );
}

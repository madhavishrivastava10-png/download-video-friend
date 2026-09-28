import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Clock,
  Grid2x2,
  Heart,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Settings,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";

const mainLinks = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/create", label: "Create", icon: Plus },
  { to: "/designs", label: "Recent Designs", icon: Clock },
  { to: "/favorites", label: "Favorites", icon: Heart },
] as const;

const templateLinks = [
  { to: "/create", search: { template: "reel" }, label: "Reel Grid", icon: LayoutGrid },
  { to: "/create", search: { template: "video" }, label: "Video Grid", icon: Square },
  { to: "/create", search: { template: "mixed" }, label: "Mixed Media", icon: Grid2x2 },
  { to: "/create", search: { template: "custom" }, label: "Custom Grid", icon: Square },
] as const;

export function AppShell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const nav = (
    <nav className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <BrandLogo size={32} />
        <button
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-1">
        {mainLinks.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === item.to
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </div>

      <div className="space-y-1">
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Templates
        </p>
        {templateLinks.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            search={item.search}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-auto space-y-1 border-t border-sidebar-border pt-4">
        <Link
          to="/settings"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60",
          )}
        >
          <Settings className="size-4 shrink-0" />
          Settings
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
        >
          <LogOut className="size-4 shrink-0" />
          Logout
        </button>
      </div>
    </nav>
  );

  return (
    <div className="page-gradient flex min-h-screen w-full">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-sidebar shadow-xl">{nav}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <BrandLogo size={28} />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

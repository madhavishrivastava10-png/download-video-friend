import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshInstagramCover } from "@/lib/media.functions";
import { Button } from "@/components/ui/button";

const WAIT_SEC = 10;

/** Waits before asking Instagram again for a cover; never sends bursts of requests. */
export function InstagramCoverRetry({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const refresh = useServerFn(refreshInstagramCover);
  const [countdown, setCountdown] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown !== 0 || !pending.current) return;
    pending.current = false;
    setBusy(true);
    refresh({ data: { itemId } })
      .then((r) => {
        if (r.ok) {
          setMessage(null);
          toast.success("Cover picture added.");
          onDone();
          return;
        }
        setMessage(r.message);
        if ("retryAfterSec" in r && r.retryAfterSec) setCountdown(r.retryAfterSec);
      })
      .catch(() => setMessage("Could not reach the server. Please try again later."))
      .finally(() => setBusy(false));
  }, [countdown, itemId, onDone, refresh]);

  function start() {
    if (busy || countdown > 0) return;
    pending.current = true;
    setMessage(null);
    setCountdown(WAIT_SEC);
  }

  const waiting = countdown > 0;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <span className="text-muted-foreground">
        Instagram didn't share a cover picture for this Reel yet. The Reel still plays.
      </span>
      <Button variant="outline" size="sm" className="w-fit rounded-xl" onClick={start} disabled={busy || waiting}>
        <RefreshCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />
        {busy ? "Checking…" : waiting ? (pending.current ? `Retrying in ${countdown}s…` : `Wait ${countdown}s`) : "Retry cover"}
      </Button>
      {message && <span className="text-destructive">{message}</span>}
    </div>
  );
}

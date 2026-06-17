"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminAutoRefresh({
  intervalSeconds,
}: {
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoRefreshEnabled = typeof intervalSeconds === "number";

  const refreshNow = useCallback(() => {
    setLastRefreshed(new Date());
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      setLastRefreshed(new Date());
    }, 0);

    if (typeof intervalSeconds !== "number") {
      return () => {
        window.clearTimeout(initialTimer);
      };
    }

    const timer = window.setInterval(refreshNow, intervalSeconds * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [intervalSeconds, refreshNow]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
      <span>
        {autoRefreshEnabled
          ? `Auto-refresh: ${intervalSeconds}s`
          : "Manual refresh"}
      </span>
      <span aria-hidden="true">|</span>
      <span>
        Last refreshed:{" "}
        {lastRefreshed
          ? lastRefreshed.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })
          : "-"}
      </span>
      <button
        type="button"
        onClick={refreshNow}
        disabled={isPending}
        className="ml-auto h-7 rounded-md border border-slate-300 px-2 font-semibold text-slate-600 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
      >
        {isPending ? "Refreshing..." : "Refresh now"}
      </button>
    </div>
  );
}

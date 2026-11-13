"use client";
import { useEffect, useState } from "react";
import type { PublicSnapshot } from "@/lib/model";
export type PublicData = PublicSnapshot & {
  total: number;
  page: number;
  limit: number;
  venues: string[];
};
export function usePublicData(query: string) {
  const [data, setData] = useState<PublicData | null>(null),
    [error, setError] = useState(""),
    [checked, setChecked] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let gone = false,
      busy = false,
      etag = "";
    const abort = new AbortController();
    async function refresh() {
      if (document.hidden || busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/public/overview?${query}`, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
          headers: etag ? { "If-None-Match": etag } : {},
        });
        if (res.status !== 304) {
          if (!res.ok) throw new Error("Scores are temporarily unavailable.");
          const body = await res.json();
          if (!gone) {
            setData(body);
            etag = res.headers.get("etag") || "";
          }
        }
        if (!gone) {
          setError("");
          setChecked(new Date().toISOString());
        }
      } catch (e) {
        if (!gone) {
          setError(
            "Connection interrupted. Showing the last successfully loaded information.",
          );
        }
      } finally {
        busy = false;
      }
    }
    void refresh();
    const interval = setInterval(refresh, 20000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      gone = true;
      abort.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [query, retry]);
  return { data, error, checked, refresh: () => setRetry((v) => v + 1) };
}

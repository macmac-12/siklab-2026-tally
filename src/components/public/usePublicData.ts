"use client";
import { useEffect, useState } from "react";
export type { PublicData } from "@/lib/public-projections";
import type { PublicData } from "@/lib/public-projections";
import {
  canonicalPublicQuery,
  publicRefreshDelay,
} from "@/lib/public-projections";
export function usePublicData(inputQuery: string) {
  const query = canonicalPublicQuery(inputQuery);
  const [state, setState] = useState<{
    query: string;
    data: PublicData | null;
    error: string;
    checked: string | null;
  }>({ query: "", data: null, error: "", checked: null });
  const [retry, setRetry] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [metadata, setMetadata] = useState<Pick<
    PublicData,
    "categories" | "venues"
  > | null>(null);
  useEffect(() => {
    let gone = false,
      busy = false,
      etag = "";
    const abort = new AbortController();
    async function refresh() {
      if (document.hidden || busy) return;
      busy = true;
      setRefreshing(true);
      try {
        const res = await fetch(`/api/public/overview?${query}`, {
          credentials: "omit",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
          headers: etag ? { "If-None-Match": etag } : {},
        });
        if (!res.ok && res.status !== 304) throw new Error("Unavailable");
        const body = res.status === 304 ? null : await res.json();
        if (!gone) {
          etag = res.headers.get("etag") || etag;
          if (body)
            setMetadata({ categories: body.categories, venues: body.venues });
          setState((previous) => ({
            query,
            data: body || (previous.query === query ? previous.data : null),
            error: "",
            checked: new Date().toISOString(),
          }));
        }
      } catch {
        if (!gone)
          setState((previous) => {
            const data = previous.query === query ? previous.data : null;
            return {
              query,
              data,
              checked: data ? previous.checked : null,
              error: data
                ? "Connection interrupted. Showing previously loaded information; it may be out of date."
                : "Event information could not be loaded. Check your connection and try again.",
            };
          });
      } finally {
        busy = false;
        if (!gone) setRefreshing(false);
      }
    }
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await refresh();
        if (!gone) schedule();
      }, publicRefreshDelay());
    };
    schedule();
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      gone = true;
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [query, retry]);
  const current = state.query === query;
  return {
    data: current ? state.data : null,
    metadata,
    error: current ? state.error : "",
    checked: current ? state.checked : null,
    refreshing,
    refresh: () => setRetry((v) => v + 1),
  };
}

import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { dangerouslyDeleteByTag, getCache } from "@vercel/functions";

export const PUBLIC_FRESHNESS_MS = 15_000;
export type FreshPublicSnapshot<T> = { data: T; freshUntil: number };
type PackedSnapshot = { format: 1; freshUntil: number; gzip: string };
type CacheAccess = {
  get(key: string): Promise<unknown>;
  set(
    key: string,
    value: unknown,
    options: { ttl: number; tags: string[] },
  ): Promise<unknown>;
};
type CacheOptions = {
  key: string;
  tag: string;
  cache?: CacheAccess;
  purge?: (tag: string) => Promise<unknown>;
  now?: () => number;
  warn?: (message: string) => void;
  retryDelay?: () => Promise<void>;
  timeoutMs?: number;
};

function withCacheDeadline<T>(operation: Promise<T>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Public cache deadline exceeded.")),
      milliseconds,
    );
  });
  // Promise.race also handles a late rejection from the original SDK operation.
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

/** The shared snapshot and every CDN variant spend the same freshness budget. */
export function createPublicSnapshotCache(options: CacheOptions) {
  const now = options.now || Date.now;
  const warn = options.warn || console.warn;
  const timeoutMs = options.timeoutMs ?? 750;
  let generation = 0;
  let pending:
    | { generation: number; promise: Promise<FreshPublicSnapshot<unknown>> }
    | undefined;

  async function read<T>(
    load: () => Promise<T>,
  ): Promise<FreshPublicSnapshot<T>> {
    if (pending?.generation === generation)
      return pending.promise as Promise<FreshPublicSnapshot<T>>;
    const startedGeneration = generation;
    const promise = (async () => {
      let cacheAvailable = !!options.cache;
      if (options.cache) {
        try {
          const packed = (await withCacheDeadline(
            options.cache.get(options.key),
            timeoutMs,
          )) as PackedSnapshot | undefined;
          if (startedGeneration !== generation) return read(load);
          if (
            packed?.format === 1 &&
            Number.isFinite(packed.freshUntil) &&
            packed.freshUntil > now() &&
            packed.freshUntil <= now() + PUBLIC_FRESHNESS_MS
          ) {
            const data = JSON.parse(
              gunzipSync(Buffer.from(packed.gzip, "base64"), {
                maxOutputLength: 32 * 1024 * 1024,
              }).toString("utf8"),
            ) as T;
            // Decompression is work too; never extend an expired snapshot's life.
            if (packed.freshUntil > now())
              return { data, freshUntil: packed.freshUntil };
          }
        } catch {
          cacheAvailable = false;
          warn("Public cache unavailable; reading approved data directly.");
        }
      }
      // Start the deadline before the repeatable-read database snapshot begins.
      const freshUntil = now() + PUBLIC_FRESHNESS_MS;
      const data = await load();
      if (startedGeneration !== generation) return read(load);
      const ttl = Math.floor((freshUntil - now()) / 1000);
      if (cacheAvailable && options.cache && ttl > 0) {
        try {
          await withCacheDeadline(
            options.cache.set(
              options.key,
              {
                format: 1,
                freshUntil,
                gzip: gzipSync(JSON.stringify(data)).toString("base64"),
              } satisfies PackedSnapshot,
              { ttl, tags: [options.tag] },
            ),
            timeoutMs,
          );
          if (startedGeneration !== generation) {
            // A publish may have completed while this older cache write was in flight.
            await invalidate();
            return read(load);
          }
        } catch {
          warn(
            "Public cache write unavailable; approved data was read directly.",
          );
        }
      }
      return { data, freshUntil };
    })();
    const entry = { generation: startedGeneration, promise };
    pending = entry;
    try {
      return await promise;
    } finally {
      if (pending === entry) pending = undefined;
    }
  }

  async function invalidate() {
    generation++;
    pending = undefined;
    if (!options.purge) return;
    // A cache outage must never turn a committed, acknowledged write into a failure.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await withCacheDeadline(options.purge(options.tag), timeoutMs);
        return;
      } catch {
        if (!attempt)
          await (options.retryDelay?.() ||
            new Promise((resolve) => setTimeout(resolve, 150)));
      }
    }
    warn(
      "Public cache purge unavailable after commit; the 15-second freshness deadline still applies.",
    );
  }
  return { read, invalidate };
}

export function publicCacheNamespace(
  env: Record<string, string | undefined> = process.env,
) {
  let database = env.SUPABASE_PROJECT_REF || env.SUPABASE_URL || "";
  if (!database && env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      // Never put a database password in cache keys, tags or logs.
      database = `${url.hostname}/${url.pathname}/${url.username}`;
    } catch {
      database = "unconfigured";
    }
  }
  const identity = [
    env.VERCEL_PROJECT_ID || "local",
    database,
    env.VERCEL_ENV || env.NODE_ENV || "local",
  ];
  return `siklab-public-v1-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24)}`;
}

export const publicCacheTag = () => publicCacheNamespace();

export function localPublicCacheEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.VERCEL || env.LOCAL_PUBLIC_CACHE !== "true" || !env.DATABASE_URL)
    return false;
  try {
    return /^\/siklab_rehearsal_/.test(new URL(env.DATABASE_URL).pathname);
  } catch {
    return false;
  }
}

/** Single-process rehearsal substitute for Runtime Cache, never a CDN emulator. */
export function createLocalPublicCacheAdapter(now = Date.now) {
  const entries = new Map<
    string,
    {
      value: unknown;
      expiresAt: number;
      tags: string[];
    }
  >();
  const cache: CacheAccess = {
    get: async (key) => {
      const entry = entries.get(key);
      if (entry && entry.expiresAt > now()) return structuredClone(entry.value);
      entries.delete(key);
      return undefined;
    },
    set: async (key, value, options) => {
      entries.set(key, {
        value: structuredClone(value),
        expiresAt: now() + options.ttl * 1000,
        tags: [...options.tags],
      });
    },
  };
  const purge = async (tag: string) => {
    for (const [key, entry] of entries)
      if (entry.tags.includes(tag)) entries.delete(key);
  };
  return { cache, purge };
}

let active:
  | {
      namespace: string;
      hosted: boolean;
      emulated: boolean;
      cache: ReturnType<typeof createPublicSnapshotCache>;
    }
  | undefined;
function sharedCache() {
  const namespace = publicCacheNamespace();
  const hosted = process.env.VERCEL === "1";
  const emulated = localPublicCacheEnabled();
  if (
    !active ||
    active.namespace !== namespace ||
    active.hosted !== hosted ||
    active.emulated !== emulated
  ) {
    active = {
      namespace,
      hosted,
      emulated,
      cache: createPublicSnapshotCache({
        key: `${namespace}:snapshot`,
        tag: namespace,
        ...(hosted
          ? {
              cache: {
                get: (key: string) => getCache({ namespace }).get(key),
                set: (
                  key: string,
                  value: unknown,
                  options: { ttl: number; tags: string[] },
                ) => getCache({ namespace }).set(key, value, options),
              },
              purge: (tag: string) =>
                dangerouslyDeleteByTag(tag, { revalidationDeadlineSeconds: 0 }),
            }
          : emulated
            ? createLocalPublicCacheAdapter()
            : {}),
      }),
    };
  }
  return active.cache;
}

export const readPublicSnapshot = <T>(load: () => Promise<T>) =>
  sharedCache().read(load);
export const invalidatePublicData = () => sharedCache().invalidate();

export function publicCacheHeaders(
  freshUntil: number,
  now = Date.now(),
): Record<string, string> {
  const remaining = Math.floor((freshUntil - now) / 1000);
  if (!Number.isFinite(remaining) || remaining < 1)
    return {
      "Cache-Control": "private, no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    };
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-CDN-Cache-Control": `public, s-maxage=${Math.min(15, remaining)}`,
    "Vercel-Cache-Tag": publicCacheTag(),
    Vary: "Accept-Encoding",
  };
}

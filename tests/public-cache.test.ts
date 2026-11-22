import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  createLocalPublicCacheAdapter,
  createPublicSnapshotCache,
  invalidatePublicData,
  localPublicCacheEnabled,
  readPublicSnapshot,
  publicCacheHeaders,
  publicCacheNamespace,
} from "../src/lib/server/cache";
import {
  canonicalPublicQuery,
  publicRefreshDelay,
} from "../src/lib/public-projections";
import { commandChangesPublicData } from "../src/lib/server/actions";
import type { Command } from "../src/lib/server/validation";

function fixture() {
  let clock = 100_000;
  const entries = new Map<string, unknown>();
  const warnings: string[] = [];
  let reads = 0,
    writes = 0,
    purges = 0;
  const options = {
    key: "snapshot",
    tag: "public-test",
    now: () => clock,
    warn: (message: string) => warnings.push(message),
    retryDelay: async () => {},
    cache: {
      get: async (key: string) => {
        reads++;
        return entries.get(key);
      },
      set: async (key: string, value: unknown) => {
        writes++;
        entries.set(key, value);
      },
    },
    purge: async () => {
      purges++;
      entries.clear();
    },
  };
  return {
    options,
    entries,
    warnings,
    advance: (ms: number) => {
      clock += ms;
    },
    metrics: () => ({ reads, writes, purges }),
  };
}

test("shared approved snapshot is compressed, reused across instances and bounded by its original deadline", async () => {
  const f = fixture();
  let loads = 0;
  const load = async () => ({
    approved: ++loads,
    rows: Array.from({ length: 100 }, () => "approved public result"),
  });
  const first = createPublicSnapshotCache(f.options);
  const a = await first.read(load);
  const stored = f.entries.get("snapshot") as { gzip: string };
  assert.equal(typeof stored.gzip, "string");
  assert(
    Buffer.byteLength(stored.gzip) < Buffer.byteLength(JSON.stringify(a.data)),
  );
  f.advance(5_000);
  const second = createPublicSnapshotCache(f.options);
  const b = await second.read(load);
  assert.deepEqual(a, b);
  assert.equal(loads, 1);
  const headers = publicCacheHeaders(b.freshUntil, 105_000);
  assert.equal(headers["Vercel-CDN-Cache-Control"], "public, s-maxage=10");
  assert.equal(headers["Cache-Control"], "public, max-age=0, must-revalidate");
  f.advance(10_000);
  const c = await second.read(load);
  assert.equal(loads, 2);
  assert.equal(c.freshUntil, 130_000);
  assert.equal(
    publicCacheHeaders(b.freshUntil, 115_000)["Vercel-CDN-Cache-Control"],
    "no-store",
  );
});

test("old snapshots after idle, corrupt cache data and cache outages are never served as fresh", async () => {
  const f = fixture();
  f.entries.set("snapshot", {
    format: 1,
    freshUntil: 99_999,
    gzip: gzipSync('{"approved":"old"}').toString("base64"),
  });
  const cache = createPublicSnapshotCache(f.options);
  assert.deepEqual((await cache.read(async () => ({ approved: "new" }))).data, {
    approved: "new",
  });
  f.entries.set("snapshot", { format: 1, freshUntil: 115_000, gzip: "broken" });
  assert.equal(
    (await cache.read(async () => "fresh after corruption")).data,
    "fresh after corruption",
  );
  const unavailable = createPublicSnapshotCache({
    ...f.options,
    cache: {
      get: async () => {
        throw Error("cache paused");
      },
      set: async () => {
        throw Error("cache paused");
      },
    },
  });
  assert.equal(
    (await unavailable.read(async () => "fresh database value")).data,
    "fresh database value",
  );
  assert.equal(f.warnings.length, 2);
});

test("slow snapshot reads consume the shared deadline instead of extending CDN freshness", async () => {
  const f = fixture();
  const cache = createPublicSnapshotCache(f.options);
  const result = await cache.read(async () => {
    f.advance(4_000);
    return "approved";
  });
  assert.equal(result.freshUntil, 115_000);
  assert.equal(
    publicCacheHeaders(result.freshUntil, 104_000)["Vercel-CDN-Cache-Control"],
    "public, s-maxage=11",
  );
  assert.equal(
    publicCacheHeaders(result.freshUntil, 114_001)["Vercel-CDN-Cache-Control"],
    "no-store",
  );
  assert.equal(
    publicCacheHeaders(Number.NaN)["Cache-Control"],
    "private, no-store",
  );
});

test("database failures are not cached and concurrent misses share one in-flight load", async () => {
  const f = fixture();
  const cache = createPublicSnapshotCache(f.options);
  await assert.rejects(
    cache.read(async () => {
      throw Error("database unavailable");
    }),
    /database unavailable/,
  );
  assert.equal(f.metrics().writes, 0);
  let loads = 0;
  const load = async () => {
    loads++;
    await Promise.resolve();
    return "approved";
  };
  assert.deepEqual(
    await Promise.all([cache.read(load), cache.read(load), cache.read(load)]),
    Array.from({ length: 3 }, () => ({
      data: "approved",
      freshUntil: 115_000,
    })),
  );
  assert.equal(loads, 1);
});

test("hung runtime cache calls fall back or acknowledge within the deadline, including late rejection", async () => {
  const f = fixture();
  const never = () => new Promise<never>(() => {});
  let rejectRead!: (reason: Error) => void;
  const lateRead = new Promise<unknown>((_resolve, reject) => {
    rejectRead = reject;
  });
  const readCache = createPublicSnapshotCache({
    ...f.options,
    timeoutMs: 10,
    cache: { get: () => lateRead, set: never },
  });
  assert.equal(
    (await readCache.read(async () => "fresh database value")).data,
    "fresh database value",
  );
  rejectRead(new Error("SDK rejected after its caller timed out"));
  await new Promise((resolve) => setImmediate(resolve));
  const writeCache = createPublicSnapshotCache({
    ...f.options,
    timeoutMs: 10,
    cache: { get: async () => null, set: never },
  });
  assert.equal(
    (await writeCache.read(async () => "fresh despite hung write")).data,
    "fresh despite hung write",
  );
  let purgeAttempts = 0;
  const purgeCache = createPublicSnapshotCache({
    ...f.options,
    timeoutMs: 10,
    purge: () => {
      purgeAttempts++;
      return never();
    },
  });
  await assert.doesNotReject(purgeCache.invalidate());
  assert.equal(purgeAttempts, 2);
  assert.equal(f.warnings.length, 3);
});

test("publication purge reaches another instance; purge outage never rejects an acknowledged write", async () => {
  const f = fixture();
  const first = createPublicSnapshotCache(f.options),
    second = createPublicSnapshotCache(f.options);
  await first.read(async () => "old result");
  await second.invalidate();
  assert.equal(
    (await first.read(async () => "corrected result")).data,
    "corrected result",
  );
  let attempts = 0;
  const unavailable = createPublicSnapshotCache({
    ...f.options,
    purge: async () => {
      attempts++;
      throw Error("429");
    },
  });
  await assert.doesNotReject(unavailable.invalidate());
  assert.equal(attempts, 2);
  assert.equal(f.warnings.length, 1);
});

test("in-flight reads from before a local commit cannot overwrite the new snapshot", async () => {
  const f = fixture();
  const cache = createPublicSnapshotCache(f.options);
  let release!: () => void;
  let began!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  let calls = 0;
  const load = async () => {
    if (++calls === 1) {
      began();
      await waiting;
      return "old";
    }
    return "new";
  };
  const pending = cache.read(load);
  await started;
  await cache.invalidate();
  release();
  assert.equal((await pending).data, "new");
  assert.equal((await cache.read(load)).data, "new");
});

test("cache namespace isolates projects, databases, environments and format versions without passwords", () => {
  const env = {
    VERCEL_PROJECT_ID: "project",
    VERCEL_ENV: "production",
    DATABASE_URL: "postgres://postgres.ref:secret@pooler.test:6543/postgres",
  };
  const namespace = publicCacheNamespace(env);
  assert.match(namespace, /^siklab-public-v2-/);
  assert(!namespace.includes("secret"));
  assert.notEqual(
    namespace,
    publicCacheNamespace({ ...env, VERCEL_ENV: "preview" }),
  );
  assert.notEqual(
    namespace,
    publicCacheNamespace({ ...env, VERCEL_PROJECT_ID: "another" }),
  );
  assert.notEqual(
    namespace,
    publicCacheNamespace({
      ...env,
      DATABASE_URL: env.DATABASE_URL.replace("postgres.ref", "postgres.other"),
    }),
  );
  assert.equal(
    namespace,
    publicCacheNamespace({
      ...env,
      DATABASE_URL: env.DATABASE_URL.replace("secret", "rotated"),
    }),
  );
});

test("an older cache write finishing after publication is purged and reloaded", async () => {
  const f = fixture();
  let release!: () => void;
  let began!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  let writes = 0;
  const cache = createPublicSnapshotCache({
    ...f.options,
    cache: {
      ...f.options.cache,
      set: async (key, value) => {
        if (++writes === 1) {
          began();
          await waiting;
        }
        f.entries.set(key, value);
      },
    },
  });
  let published = false;
  const pending = cache.read(async () => (published ? "new" : "old"));
  await started;
  published = true;
  await cache.invalidate();
  release();
  assert.equal((await pending).data, "new");
  assert.equal((await cache.read(async () => "unexpected reload")).data, "new");
  assert.equal(f.metrics().purges, 2);
});

test("canonical query includes every effective filter and omits presentation-only state", () => {
  const query =
    "view=results&category=basketball-men&date=2026-11-23&venue=Court+1&status=completed&college=CCS&page=2&limit=20&round=r1&bracket=b1&mode=bracket";
  const canonical = canonicalPublicQuery(query);
  const reversed = new URLSearchParams(
    [...new URLSearchParams(query)].reverse(),
  );
  assert.equal(canonical, canonicalPublicQuery(reversed));
  const params = new URLSearchParams(canonical);
  assert.equal(params.size, 8);
  for (const key of params.keys()) {
    const changed = new URLSearchParams(params);
    changed.set(key, `changed-${params.get(key)}`);
    assert.notEqual(canonical, canonicalPublicQuery(changed), key);
  }
  assert.equal(
    publicRefreshDelay(() => 0.5),
    300_000,
  );
  assert.equal(
    publicRefreshDelay(() => 0),
    285_000,
  );
  assert.equal(
    publicRefreshDelay(() => 1),
    315_000,
  );
});

test("only public changes invalidate shared data; unpublished work and accounts do not", () => {
  const decision = (command: object) =>
    commandChangesPublicData(command as Command);
  for (const action of [
    "tally.correct",
    "schedule.save",
    "entry.add",
    "category.configure",
    "discipline.configure",
  ])
    assert.equal(decision({ action }), true, action);
  assert.equal(decision({ action: "review", decision: "approve" }), true);
  assert.equal(decision({ action: "review", decision: "reject" }), false);
  assert.equal(decision({ action: "bracket.save", publish: true }), true);
  assert.equal(decision({ action: "bracket.save", publish: false }), false);
  for (const action of ["result.save", "award.submit", "account.save"])
    assert.equal(decision({ action }), false, action);
});

test("local cache emulation requires explicit opt-in and a disposable rehearsal database, never Vercel", () => {
  const env = {
    LOCAL_PUBLIC_CACHE: "true",
    DATABASE_URL: "postgres://local:private@localhost/siklab_rehearsal_123",
  };
  assert.equal(localPublicCacheEnabled(env), true);
  assert.equal(
    localPublicCacheEnabled({ ...env, NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    localPublicCacheEnabled({ ...env, LOCAL_PUBLIC_CACHE: "false" }),
    false,
  );
  assert.equal(
    localPublicCacheEnabled({ DATABASE_URL: env.DATABASE_URL }),
    false,
  );
  for (const VERCEL of ["1", "true", "0"])
    assert.equal(localPublicCacheEnabled({ ...env, VERCEL }), false);
  for (const name of [
    "postgres",
    "siklab",
    "siklab_test_123",
    "real_siklab_rehearsal_123",
  ])
    assert.equal(
      localPublicCacheEnabled({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace("siklab_rehearsal_123", name),
      }),
      false,
    );
  assert.equal(
    localPublicCacheEnabled({ ...env, DATABASE_URL: "invalid" }),
    false,
  );
});

test("local rehearsal adapter uses the compressed engine's expiry and tag invalidation", async () => {
  let now = 100_000;
  const adapter = createLocalPublicCacheAdapter(() => now);
  const options = {
    ...adapter,
    key: "rehearsal",
    tag: "rehearsal-public",
    now: () => now,
  };
  const first = createPublicSnapshotCache(options),
    second = createPublicSnapshotCache(options);
  let loads = 0;
  const load = async () => ({ approved: ++loads });
  const original = await first.read(load);
  assert.equal((await second.read(load)).data.approved, 1);
  now += 15_000;
  assert.equal((await second.read(load)).data.approved, 2);
  assert.equal(
    publicCacheHeaders(original.freshUntil, now)["Vercel-CDN-Cache-Control"],
    "no-store",
  );
  await first.invalidate();
  assert.equal((await second.read(load)).data.approved, 3);
});

test("changing the local rehearsal flag switches the actual shared loader without retaining emulated entries", async () => {
  const keys = ["VERCEL", "LOCAL_PUBLIC_CACHE", "DATABASE_URL"] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  try {
    delete process.env.VERCEL;
    process.env.DATABASE_URL =
      "postgres://local:private@localhost/siklab_rehearsal_switch_test";
    process.env.LOCAL_PUBLIC_CACHE = "true";
    let loads = 0;
    const load = async () => ++loads;
    assert.equal((await readPublicSnapshot(load)).data, 1);
    assert.equal((await readPublicSnapshot(load)).data, 1);
    await invalidatePublicData();
    assert.equal((await readPublicSnapshot(load)).data, 2);
    process.env.LOCAL_PUBLIC_CACHE = "false";
    assert.equal((await readPublicSnapshot(load)).data, 3);
    assert.equal((await readPublicSnapshot(load)).data, 4);
    process.env.LOCAL_PUBLIC_CACHE = "true";
    assert.equal((await readPublicSnapshot(load)).data, 5);
    assert.equal((await readPublicSnapshot(load)).data, 5);
    process.env.DATABASE_URL = "postgres://local:private@localhost/real_event";
    assert.equal((await readPublicSnapshot(load)).data, 6);
    assert.equal((await readPublicSnapshot(load)).data, 7);
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

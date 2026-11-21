import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, hash } from "@/lib/server/store";
import {
  currentUser,
  login,
  logout,
  checkOrigin,
  readJson,
  changePassword,
} from "@/lib/server/authentication";
import { loginSchema, passwordSchema } from "@/lib/server/validation";
import { publicStateWithFreshness } from "@/lib/server/public";
import { publicCacheHeaders } from "@/lib/server/cache";
import { command, staffState } from "@/lib/server/actions";
import { createBackupDownload, createBackupUpload, restoreStoredBackup, resetCompetitionData, cleanupMaintenance } from "@/lib/server/maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function handle(request: Request) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\//, ""),
      method = request.method;
    if (path === "internal/backup-cleanup" && method === "GET") {
      if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
        throw new AppError(401, "Unauthorized.");
      await cleanupMaintenance();
      return NextResponse.json({ok:true});
    }
    if (
      method === "GET" &&
      [
        "public/overview",
        "public/brackets",
        "public/daily-agenda",
        "public/college-results",
        "public/schedules",
        "public/results",
        "public/standings",
      ].includes(path)
    ) {
      if (!url.searchParams.has("view"))
        url.searchParams.set(
          "view",
          (
            {
              "public/daily-agenda": "overview",
              "public/college-results": "results",
              "public/brackets": "brackets",
              "public/schedules": "schedules",
              "public/results": "results",
            } as Record<string, string>
          )[path] || "default",
        );
      const {data, freshUntil} = await publicStateWithFreshness(url.searchParams),
        body = JSON.stringify(data),
        etag = `"${hash(body).slice(0, 24)}"`;
      const headers = {
        ETag: etag,
        ...publicCacheHeaders(freshUntil),
        Vary: "Accept-Encoding",
      };
      // Compression at the CDN may turn our strong ETag into a weak validator.
      const matches = request.headers.get("if-none-match")?.split(",").some(value =>
        value.trim() === "*" || value.trim().replace(/^W\//, "") === etag,
      );
      if (matches)
        return new Response(null, { status: 304, headers });
      return new Response(body, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (method === "POST") checkOrigin(request);
    if (path === "auth/login" && method === "POST") {
      const b = loginSchema.parse(await readJson(request));
      return NextResponse.json(await login(b.email, b.password));
    }
    if (path === "auth/logout" && method === "POST")
      return NextResponse.json(await logout());
    if (
      !path.startsWith("staff/") &&
      !["auth/me", "auth/password"].includes(path)
    )
      return NextResponse.json(
        {
          error:
            "This legacy endpoint has been retired. Use the public or staff API.",
        },
        { status: 410 },
      );
    const user = await currentUser();
    if (path === "auth/me" && method === "GET")
      return NextResponse.json(
        { user },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (path === "auth/password" && method === "POST") {
      const b = passwordSchema.parse(await readJson(request));
      return NextResponse.json(
        await changePassword(user, b.currentPassword, b.newPassword),
      );
    }
    if (path === "staff/state" && method === "GET")
      return NextResponse.json(await staffState(user), {
        headers: { "Cache-Control": "no-store" },
      });
    if (user.mustReset)
      throw new AppError(
        403,
        "Change your temporary password before continuing.",
      );
    if (path === "staff/command" && method === "POST")
      return NextResponse.json(
        await command(
          user,
          await readJson(request),
          request.headers.get("idempotency-key") || "",
        ),
      );
    if (path === "staff/backup" && method === "GET")
      return NextResponse.json(await createBackupDownload(user));
    if (path === "staff/backup-upload" && method === "POST")
      return NextResponse.json(await createBackupUpload(user));
    if (path === "staff/restore" && method === "POST")
      return NextResponse.json(
        await restoreStoredBackup(user, await readJson(request)),
      );
    if (path === "staff/reset" && method === "POST")
      return NextResponse.json(await resetCompetitionData(user, await readJson(request)));
    return NextResponse.json({ error: "Endpoint not found." }, { status: 404 });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    const code = (error as { code?: string }).code;
    if (code === "23505")
      return NextResponse.json(
        { error: "This record or pending submission already exists." },
        { status: 409 },
      );
    if (code === "23503" || code === "23514")
      return NextResponse.json(
        { error: "Invalid record references or constraints." },
        { status: 400 },
      );
    if (
      error instanceof Error &&
      !code &&
      /plac|rule|point|tied|college|ruling|eligible|Include|Ranked|category/i.test(
        error.message,
      )
    )
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(
      "API failure:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "The service is temporarily unavailable. Your last confirmed data is preserved; retry shortly.",
      },
      { status: 503 },
    );
  }
}
async function respond(request: Request) {
  const response = await handle(request);
  if (!response.headers.has("Vercel-Cache-Tag")) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  }
  return response;
}
export const GET = respond;
export const POST = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;

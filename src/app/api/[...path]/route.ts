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
import { publicState } from "@/lib/server/public";
import { command, staffState } from "@/lib/server/actions";
import { exportBackup, restoreBackup } from "@/lib/server/backup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\//, ""),
      method = request.method;
    if (
      method === "GET" &&
      [
        "public/overview",
        "public/schedules",
        "public/results",
        "public/standings",
      ].includes(path)
    ) {
      const state = await publicState(url.searchParams),
        body = JSON.stringify(state),
        etag = `"${hash(body).slice(0, 24)}"`;
      const headers = {
        ETag: etag,
        "Cache-Control": "public, max-age=0, must-revalidate",
        Vary: "Accept-Encoding",
      };
      if (request.headers.get("if-none-match") === etag)
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
      return NextResponse.json(await exportBackup(user), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": 'attachment; filename="siklab-backup.json"',
        },
      });
    if (path === "staff/restore" && method === "POST")
      return NextResponse.json(
        await restoreBackup(user, await readJson(request, 25_000_000)),
      );
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
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

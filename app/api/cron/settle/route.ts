import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !supplied) return false;
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!process.env.DATABASE_URL) return Response.json({ status: "skipped", reason: "No cloud database is configured; the app settles local profiles when opened." }, { headers: { "Cache-Control": "no-store" } });
  return Response.json({ status: "unavailable", reason: "Cloud settlement worker is not enabled until authenticated profile sync is configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

import { timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/db/connection";
import { enqueueAllMissingSettlementJobs, processPendingSettlementJobs } from "@/lib/db/settlement";

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

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!process.env.DATABASE_URL) return Response.json({ status: "unavailable", reason: "DATABASE_URL is not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const database = getDatabase();
    const queued = await enqueueAllMissingSettlementJobs(database);
    const processed = await processPendingSettlementJobs(database);
    return Response.json({ status: "ok", queued, ...processed }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", reason: "Settlement batch failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

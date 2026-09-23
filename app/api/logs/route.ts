import { z } from "zod";
import { requireUserApiContext } from "@/lib/api/context";
import { listActivityLogs, saveActivityLog } from "@/lib/api/logs";
import { apiErrorResponse } from "@/lib/api/response";
import { validateActivityLog } from "@/lib/validation";
import { ensureUserSettled } from "@/lib/db/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const { user, database } = result.context;
  const date = new URL(request.url).searchParams.get("date");
  const parsedDate = z.iso.date().safeParse(date);
  if (!parsedDate.success) return Response.json({ error: "A valid date query is required" }, { status: 400, headers });
  try {
    await ensureUserSettled(database, user.id);
    const logs = await listActivityLogs(database, user.id, parsedDate.data);
    return Response.json({ logs }, { headers });
  } catch {
    return apiErrorResponse(new Error("Database read failed"));
  }
}

export async function POST(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const body = await request.json().catch(() => null);
  const parsed = validateActivityLog(body);
  if (!parsed.success) return Response.json({ error: parsed.message }, { status: 400, headers });
  try {
    const saved = await saveActivityLog(result.context.database, result.context.user, parsed.data);
    return Response.json({ log: saved.log }, { status: saved.created ? 201 : 200, headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

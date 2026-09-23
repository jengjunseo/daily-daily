import { z } from "zod";
import { requireUserApiContext } from "@/lib/api/context";
import { softDeleteActivityLog, updateActivityLog } from "@/lib/api/logs";
import { validateActivityLog } from "@/lib/validation";
import { apiErrorResponse } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

async function getId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return z.uuid().safeParse(id);
}

function expectedVersion(request: Request): number | null {
  const value = request.headers.get("if-match")?.replace(/^W\//, "").replaceAll('"', "");
  if (!value || !/^\d+$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const parsedId = await getId(context);
  if (!parsedId.success) return Response.json({ error: "Invalid log id" }, { status: 400, headers });
  const version = expectedVersion(request);
  if (version === null) return Response.json({ error: "If-Match with the current version is required" }, { status: 428, headers });
  const body = await request.json().catch(() => null);
  const parsed = validateActivityLog(body);
  if (!parsed.success) return Response.json({ error: parsed.message }, { status: 400, headers });
  if (parsed.data.id !== parsedId.data) return Response.json({ error: "Log id does not match the route" }, { status: 400, headers });
  try {
    const log = await updateActivityLog(result.context.database, result.context.user, parsed.data, version);
    return Response.json({ log }, { headers: { ...headers, ETag: `"${log.version}"` } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const parsedId = await getId(context);
  if (!parsedId.success) return Response.json({ error: "Invalid log id" }, { status: 400, headers });
  const version = expectedVersion(request);
  if (version === null) return Response.json({ error: "If-Match with the current version is required" }, { status: 428, headers });
  try {
    const deleted = await softDeleteActivityLog(result.context.database, result.context.user, parsedId.data, version);
    return Response.json(deleted, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

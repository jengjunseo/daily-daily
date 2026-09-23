import { z } from "zod";
import { requireUserApiContext } from "@/lib/api/context";
import { listActivityCategories } from "@/lib/api/categories";
import { getAccountSnapshot } from "@/lib/api/account";
import { listUserFavorites, listAllActivityLogs } from "@/lib/api/logs";
import { syncActivityLogs } from "@/lib/api/sync";
import { listUserPins } from "@/lib/api/pins";
import { ensureUserSettled } from "@/lib/db/settlement";
import { apiErrorResponse } from "@/lib/api/response";
import { ActivityLogSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const { database, user } = result.context;
  try {
    await ensureUserSettled(database, user.id);
    const [logs, categories, favorites, pins, account] = await Promise.all([
      listAllActivityLogs(database, user.id),
      listActivityCategories(database, user.id),
      listUserFavorites(database, user.id),
      listUserPins(database, user.id),
      getAccountSnapshot(database, user),
    ]);
    return Response.json({ logs, categories, favorites, pins, account }, { headers });
  } catch {
    return apiErrorResponse(new Error("Sync snapshot failed"));
  }
}

const SyncPayloadSchema = z.object({ logs: z.array(ActivityLogSchema).max(100) })
  .superRefine(({ logs }, context) => {
    if (new Set(logs.map((log) => log.id)).size !== logs.length) context.addIssue({ code: "custom", path: ["logs"], message: "Each log ID must appear once" });
  });

export async function POST(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const parsed = SyncPayloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid sync batch" }, { status: 400, headers });
  try {
    const sync = await syncActivityLogs(result.context.database, result.context.user, parsed.data.logs);
    return Response.json(sync, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

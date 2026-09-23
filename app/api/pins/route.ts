import { z } from "zod";
import { requireUserApiContext } from "@/lib/api/context";
import { apiErrorResponse } from "@/lib/api/response";
import { listUserPins, replaceUserPins } from "@/lib/api/pins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  try {
    return Response.json({ pins: await listUserPins(result.context.database, result.context.user.id) }, { headers });
  } catch {
    return apiErrorResponse(new Error("Pin read failed"));
  }
}

export async function PUT(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const parsed = z.object({ keys: z.array(z.string().min(1).max(100)).max(100) })
    .superRefine(({ keys }, context) => {
      if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", path: ["keys"], message: "Pinned categories must be unique" });
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid pinned categories" }, { status: 400, headers });
  try {
    return Response.json({ pins: await replaceUserPins(result.context.database, result.context.user.id, parsed.data.keys) }, { headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

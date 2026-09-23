import { requireUserApiContext } from "@/lib/api/context";
import { deleteUserFavorite, listUserFavorites } from "@/lib/api/logs";
import { apiErrorResponse } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const favoriteKinds = new Set(["subject", "project", "book", "menu", "activity_type"]);

export async function GET() {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  try {
    return Response.json({ favorites: await listUserFavorites(result.context.database, result.context.user.id) }, { headers });
  } catch {
    return apiErrorResponse(new Error("Favorite read failed"));
  }
}

export async function DELETE(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const query = new URL(request.url).searchParams;
  const kind = query.get("kind") ?? "";
  const value = query.get("value")?.trim() ?? "";
  if (!favoriteKinds.has(kind) || !value || value.length > 200) return Response.json({ error: "Invalid favorite key" }, { status: 400, headers });
  try {
    const deleted = await deleteUserFavorite(result.context.database, result.context.user.id, kind, value);
    return Response.json({ deleted }, { headers });
  } catch {
    return apiErrorResponse(new Error("Favorite update failed"));
  }
}

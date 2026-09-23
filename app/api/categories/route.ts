import { requireUserApiContext } from "@/lib/api/context";
import { createActivityCategory, listActivityCategories } from "@/lib/api/categories";
import { apiErrorResponse } from "@/lib/api/response";
import { CustomCategorySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  try {
    const categories = await listActivityCategories(result.context.database, result.context.user.id);
    return Response.json({ categories }, { headers });
  } catch {
    return apiErrorResponse(new Error("Category read failed"));
  }
}

export async function POST(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const body = await request.json().catch(() => null);
  const parsed = CustomCategorySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid custom category" }, { status: 400, headers });
  try {
    const saved = await createActivityCategory(result.context.database, result.context.user.id, parsed.data);
    return Response.json({ category: saved.category }, { status: saved.created ? 201 : 200, headers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

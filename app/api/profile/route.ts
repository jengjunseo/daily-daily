import { requireUserApiContext } from "@/lib/api/context";
import { AccountPatchSchema, deleteAccountData, getAccountSnapshot, updateAccount } from "@/lib/api/account";
import { apiErrorResponse } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  try {
    const account = await getAccountSnapshot(result.context.database, result.context.user);
    return Response.json(account, { headers });
  } catch {
    return apiErrorResponse(new Error("Account read failed"));
  }
}

export async function PATCH(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const parsed = AccountPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid account settings" }, { status: 400, headers });
  try {
    const account = await updateAccount(result.context.database, result.context.user, parsed.data);
    return Response.json(account, { headers });
  } catch {
    return apiErrorResponse(new Error("Account update failed"));
  }
}

export async function DELETE(request: Request) {
  const result = await requireUserApiContext();
  if (!result.ok) return result.response;
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (body?.confirm !== true) return Response.json({ error: "Explicit confirmation is required" }, { status: 400, headers });
  try {
    await deleteAccountData(result.context.database, result.context.user.id);
    return Response.json({ deleted: true }, { headers });
  } catch {
    return apiErrorResponse(new Error("Account deletion failed"));
  }
}

import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth/server-session";
import { getDatabase, type Database } from "@/lib/db/connection";

export type UserApiContext = { user: AuthenticatedUser; database: Database };
export type UserApiContextResult = { ok: true; context: UserApiContext } | { ok: false; response: Response };

const noStore = { "Cache-Control": "no-store" };

export async function requireUserApiContext(): Promise<UserApiContextResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401, headers: noStore }) };
  if (!process.env.DATABASE_URL) return { ok: false, response: Response.json({ error: "Database is not configured" }, { status: 503, headers: noStore }) };
  try {
    return { ok: true, context: { user, database: getDatabase() } };
  } catch {
    return { ok: false, response: Response.json({ error: "Database is unavailable" }, { status: 503, headers: noStore }) };
  }
}

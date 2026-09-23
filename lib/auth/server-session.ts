import { auth, hasOAuthCredentials } from "@/auth";

export type AuthenticatedUser = { id: string; name: string };

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (!process.env.AUTH_SECRET || !hasOAuthCredentials) return null;
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return { id, name: session.user?.name?.trim().slice(0, 80) ?? "" };
}

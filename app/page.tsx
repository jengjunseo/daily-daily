import { GameApp } from "@/components/game-app";
import { hasOAuthCredentials } from "@/auth";
import { getAuthenticatedUser } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getAuthenticatedUser();
  const cloudConfigured = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET && hasOAuthCredentials);
  return <GameApp initialViewer={viewer} cloudConfigured={cloudConfigured} />;
}

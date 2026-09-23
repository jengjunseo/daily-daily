export const runtime = "nodejs";

export function GET() {
  return Response.json({
    status: "ok",
    storageMode: "local-first",
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  }, { headers: { "Cache-Control": "no-store" } });
}

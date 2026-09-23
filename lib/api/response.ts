import { LogApiError } from "@/lib/api/logs";

const headers = { "Cache-Control": "no-store" };

export function apiErrorResponse(error: unknown) {
  if (error instanceof LogApiError) return Response.json({ error: error.message }, { status: error.status, headers });
  return Response.json({ error: "The request could not be completed" }, { status: 500, headers });
}

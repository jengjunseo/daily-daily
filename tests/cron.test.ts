import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/settle/route";

const priorSecret = process.env.CRON_SECRET;
const priorDatabaseUrl = process.env.DATABASE_URL;
afterEach(() => {
  if (priorSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = priorSecret;
  if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorDatabaseUrl;
});

describe("settlement Cron authorization", () => {
  it("rejects requests without a configured secret or matching bearer token", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request("http://localhost/api/cron/settle"))).status).toBe(401);
    process.env.CRON_SECRET = "test-secret-1234567890";
    expect((await GET(new Request("http://localhost/api/cron/settle", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("reports missing database configuration after authenticating the Cron request", async () => {
    process.env.CRON_SECRET = "test-secret-1234567890";
    delete process.env.DATABASE_URL;
    const response = await GET(new Request("http://localhost/api/cron/settle", { headers: { authorization: "Bearer test-secret-1234567890" } }));
    expect(response.status).toBe(503);
  });
});

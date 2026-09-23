import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/settle/route";

const priorSecret = process.env.CRON_SECRET;
afterEach(() => { if (priorSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = priorSecret; });

describe("settlement Cron authorization", () => {
  it("rejects requests without a configured secret or matching bearer token", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request("http://localhost/api/cron/settle"))).status).toBe(401);
    process.env.CRON_SECRET = "test-secret-1234567890";
    expect((await GET(new Request("http://localhost/api/cron/settle", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });
});

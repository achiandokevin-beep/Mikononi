// UNIT TEST (database and services mocked)
import { describe, it, expect, vi } from "vitest";
vi.mock("../src/db", () => ({ prisma: { ussdSession: { upsert: vi.fn().mockResolvedValue({}) }, incident: { findFirst: vi.fn().mockResolvedValue(null) }, networkReport: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("../src/services/reports.service", () => ({ ISSUES: ["No Network", "Slow Internet", "Calls Dropping", "Cannot Make Calls", "Cannot Receive Calls", "Other"], createReport: vi.fn().mockResolvedValue({ report: { reportNumber: "NET-2026-000001" } }) }));
vi.mock("../src/services/fraud.service", () => ({ createFraudReport: vi.fn().mockResolvedValue({ reportNumber: "FR-2026-000001" }) }));
import { handleUssd } from "../src/webhooks/ussd";
const call = (text: string) => handleUssd({ sessionId: "s1", phoneNumber: "+254712345678", serviceCode: "*384#", text });
describe("USSD flow", () => {
  it("shows main menu", async () => expect(await call("")).toMatch(/^CON MKONONI CONNECT/));
  it("asks for problem type, area, description", async () => {
    expect(await call("1")).toMatch(/^CON What problem/);
    expect(await call("1*1")).toBe("CON Enter your area/location:");
    expect(await call("1*1*Kitui")).toMatch(/^CON Briefly/);
  });
  it("saves the report and returns a reference", async () => expect(await call("1*1*Kitui*no signal")).toMatch(/^END .*NET-2026-000001/s));
  it("reports no incident honestly", async () => expect(await call("2*Kitui")).toMatch(/^END No known incident/));
  it("rejects invalid choices", async () => expect(await call("1*9")).toMatch(/^END Invalid/));
  it("saves fraud report", async () => expect(await call("3*3*sim stopped working")).toMatch(/FR-2026-000001/));
});

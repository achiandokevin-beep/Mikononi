// UNIT TEST (no network, no database)
import { describe, it, expect } from "vitest";
import { computeRisk } from "../src/services/fraud.rules";
import { isValidKenyanPhone } from "../src/utils/phone";
describe("fraud risk rules", () => {
  it("single benign report is LOW", () => expect(computeRisk("SUSPICIOUS_MESSAGE", 1)).toBe("LOW"));
  it("SIM category is MEDIUM", () => expect(computeRisk("POSSIBLE_SIM_SWAP", 1)).toBe("MEDIUM"));
  it("repeat SIM reports in an hour are HIGH", () => expect(computeRisk("LOST_STOLEN_SIM", 2)).toBe("HIGH"));
  it("3 reports in an hour are HIGH, 5 CRITICAL", () => { expect(computeRisk("SUSPICIOUS_MESSAGE", 3)).toBe("HIGH"); expect(computeRisk("SUSPICIOUS_MESSAGE", 5)).toBe("CRITICAL"); });
});
describe("phone validation", () => {
  it("accepts Kenyan numbers", () => { expect(isValidKenyanPhone("+254712345678")).toBe(true); expect(isValidKenyanPhone("+254112345678")).toBe(true); });
  it("rejects others", () => { expect(isValidKenyanPhone("0712345678")).toBe(false); expect(isValidKenyanPhone("+2557123456789")).toBe(false); });
});

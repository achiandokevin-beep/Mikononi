export const FRAUD_CATEGORIES = ["SUSPICIOUS_SIM_ACTIVITY", "UNEXPECTED_ACCOUNT_CHANGE", "SUSPICIOUS_MESSAGE", "UNAUTHORIZED_TRANSACTION", "LOST_STOLEN_SIM", "POSSIBLE_SIM_SWAP"] as const;
const SIM = new Set(["LOST_STOLEN_SIM", "POSSIBLE_SIM_SWAP", "SUSPICIOUS_SIM_ACTIVITY"]);
/** Rules-based MVP scoring on CUSTOMER-REPORTED data. recentCount = reports from this phone in the last hour, including this one. */
export function computeRisk(category: string, recentCount: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (recentCount >= 5) return "CRITICAL";
  if (recentCount >= 3 || (recentCount >= 2 && SIM.has(category))) return "HIGH";
  if (SIM.has(category) || category === "UNAUTHORIZED_TRANSACTION") return "MEDIUM";
  return "LOW";
}

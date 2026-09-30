import { randomInt } from "crypto";
import { prisma } from "../db";
import { emit } from "../realtime";
import { computeRisk } from "./fraud.rules";
import { sendSMS } from "./africastalking/sms.service";

export async function createFraudReport(d: { phoneNumber: string; category: string; description?: string }) {
  const recent = await prisma.fraudReport.count({ where: { phoneNumber: d.phoneNumber, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  const riskLevel = computeRisk(d.category, recent + 1);
  const report = await prisma.fraudReport.create({ data: {
    reportNumber: `FR-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`,
    phoneNumber: d.phoneNumber, category: d.category, description: d.description, riskLevel } }); // source defaults to CUSTOMER_REPORTED (unverified)
  emit("fraud:new", report);
  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    emit("fraud:alert", report);
    sendSMS(d.phoneNumber, `MKONONI CONNECT: We received your security report (${report.reportNumber}). If your SIM is lost or misused, contact your mobile operator immediately.`).catch(() => undefined);
  }
  return report;
}

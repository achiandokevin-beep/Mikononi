import { prisma } from "../db";
import { ISSUES, createReport } from "../services/reports.service";
import { createFraudReport } from "../services/fraud.service";
import { isValidKenyanPhone } from "../utils/phone";

const clean = (s: string, n: number) => s.replace(/[\r\n]/g, " ").trim().slice(0, n);
const MENU = "CON MKONONI CONNECT\n1. Report Network Problem\n2. Check Network Status\n3. Report Fraud\n4. My Reports\n0. Exit";
const FRAUD = ["SUSPICIOUS_SIM_ACTIVITY", "LOST_STOLEN_SIM", "POSSIBLE_SIM_SWAP"];

/** Africa's Talking sends cumulative `text` like "1*2*Kitui". Returns a CON/END string. */
export async function handleUssd(b: { sessionId: string; phoneNumber: string; serviceCode: string; networkCode?: string; text?: string }) {
  const p = b.text ? b.text.split("*") : [];
  const reply = await (async () => {
    if (!isValidKenyanPhone(b.phoneNumber)) return "END Sorry, this service is only available for Kenyan numbers.";
    if (!p.length) return MENU;
    if (p[0] === "0") return "END Thank you for using Mkononi Connect.";
    if (p[0] === "1") {
      if (p.length === 1) return "CON What problem are you experiencing?\n" + ISSUES.map((x, i) => `${i + 1}. ${x}`).join("\n");
      const issue = ISSUES[Number(p[1]) - 1];
      if (!issue) return "END Invalid choice. Please dial again.";
      if (p.length === 2) return "CON Enter your area/location:";
      if (p.length === 3) return "CON Briefly describe the problem:";
      const { report } = await createReport({ phoneNumber: b.phoneNumber, issueType: issue, location: clean(p[2], 60), description: clean(p[3], 160) });
      return `END Thank you. Your network report has been received.\nReference: ${report.reportNumber}`;
    }
    if (p[0] === "2") {
      if (p.length === 1) return "CON Enter your area:";
      const area = clean(p[1], 60).toLowerCase();
      const inc = await prisma.incident.findFirst({ where: { area, isDemo: false, status: { in: ["POSSIBLE_OUTAGE", "CONFIRMED"] } }, orderBy: { detectedAt: "desc" } });
      if (!inc) return "END No known incident in your area right now. If you have a problem, please report it (option 1).";
      const label = inc.status === "CONFIRMED" ? "Confirmed network issue" : "Possible outage (not yet confirmed)";
      return `END ${label}\nIncident: ${inc.incidentNumber}\nDetected: ${Math.max(1, Math.round((Date.now() - inc.detectedAt.getTime()) / 60000))} min ago`;
    }
    if (p[0] === "3") {
      if (p.length === 1) return "CON Fraud & SIM Security\n1. Suspicious Activity\n2. Lost/Stolen SIM\n3. Possible SIM Swap";
      const category = FRAUD[Number(p[1]) - 1];
      if (!category) return "END Invalid choice. Please dial again.";
      if (p.length === 2) return "CON Briefly describe what happened:";
      const r = await createFraudReport({ phoneNumber: b.phoneNumber, category, description: clean(p[2], 160) });
      return `END Your security report has been received.\nReference: ${r.reportNumber}`;
    }
    if (p[0] === "4") {
      const rs = await prisma.networkReport.findMany({ where: { phoneNumber: b.phoneNumber }, orderBy: { createdAt: "desc" }, take: 3 });
      if (!rs.length) return "END You have no reports yet.";
      return ("END My Reports\n" + rs.map((r) => `${r.reportNumber} ${r.issueType} ${r.location}`).join("\n")).slice(0, 180);
    }
    return "END Invalid choice. Please dial again.";
  })();
  const finished = reply.startsWith("END");
  await prisma.ussdSession.upsert({
    where: { sessionId: b.sessionId },
    create: { sessionId: b.sessionId, phoneNumber: b.phoneNumber, serviceCode: b.serviceCode, networkCode: b.networkCode, currentStep: `L${p.length}`, userInput: b.text ?? "", completedAt: finished ? new Date() : null },
    update: { currentStep: `L${p.length}`, userInput: b.text ?? "", completedAt: finished ? new Date() : null },
  }).catch(() => undefined); // session logging must never break the user's USSD reply
  return reply;
}

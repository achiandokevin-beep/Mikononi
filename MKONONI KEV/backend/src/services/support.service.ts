import { prisma } from "../db";
import { complete } from "./ai.service";
import { createReport } from "./reports.service";

const SYSTEM = "You are Mkononi Connect's support assistant. Reply in at most 3 short, plain sentences. Use ONLY the FACTS provided. Never state or imply an outage, incident or report that is not in FACTS.";
const FRAUD_TIPS = "To protect your SIM: never share your PIN or OTP, be careful with unexpected calls or messages asking for them, and contact your mobile operator right away if you lose your SIM or lose signal unexpectedly. You can also file a security report through this service.";
const say = (s: string) => s.replace("_", " ").toLowerCase();

export async function chat(phone: string | undefined, message: string, conversationId: string) {
  const msg = message.trim().slice(0, 500), lower = msg.toLowerCase();
  const last = await prisma.supportMessage.findFirst({ where: { conversationId, role: "assistant" }, orderBy: { createdAt: "desc" } });
  await prisma.supportMessage.create({ data: { conversationId, phoneNumber: phone, role: "user", content: msg } });
  const awaiting = last?.intent?.startsWith("AWAIT_AREA:") ? last.intent.slice(11) : null;
  const issue = awaiting ?? (/slow/.test(lower) ? "Slow Internet" : /dropp/.test(lower) ? "Calls Dropping" : "No Network");

  let intent = "GENERAL", area: string | null = null, facts: string | null = null, fixed: string | null = null, escalated = false;
  if (awaiting) { intent = "REPORT"; area = msg.slice(0, 60); }
  else if (/my (previous )?reports?|previous report/.test(lower)) intent = "MY_REPORTS";
  else if (/\b(sim|fraud|scam|swap|stolen|suspicious)\b/.test(lower)) intent = "FRAUD";
  else if (/outage|is there|status|problem in/.test(lower)) intent = "STATUS";
  else if (/not working|\bdown\b|slow|no network|cannot|can't|dropp/.test(lower)) intent = "REPORT";
  if (intent === "STATUS" || (intent === "REPORT" && !area)) {
    const known = await prisma.networkReport.findMany({ where: { isDemo: false }, distinct: ["area"], select: { area: true }, take: 300 });
    area = known.map((k) => k.area).find((a) => lower.includes(a)) ?? null;
  }

  if (intent === "FRAUD") fixed = FRAUD_TIPS;
  else if (intent === "MY_REPORTS") {
    if (!phone) fixed = "Please log in with your customer account so I can look up your reports.";
    else {
      const rs = await prisma.networkReport.findMany({ where: { phoneNumber: phone }, orderBy: { createdAt: "desc" }, take: 3 });
      facts = rs.length ? "Recent reports: " + rs.map((r) => `${r.reportNumber} (${r.issueType}, ${r.location}, ${say(r.status)})`).join("; ") : "There are no reports on record for this number.";
    }
  } else if (intent === "STATUS") {
    if (!area) fixed = "Which area are you asking about?";
    else {
      const inc = await prisma.incident.findFirst({ where: { area, isDemo: false, status: { in: ["POSSIBLE_OUTAGE", "CONFIRMED"] } }, orderBy: { detectedAt: "desc" } });
      facts = inc ? `Incident ${inc.incidentNumber} in ${area}: ${say(inc.status)}${inc.status === "POSSIBLE_OUTAGE" ? " (not yet confirmed by our team)" : ""}, ${inc.affectedUsers} customers have reported it.`
                  : `No open incident is recorded for ${area}.`;
    }
  } else if (intent === "REPORT") {
    if (!phone) fixed = "To file a report I need your phone number. Please log in with a customer account or use the USSD service.";
    else if (!area) { intent = `AWAIT_AREA:${issue}`; fixed = "I can help you report this. What area are you currently in?"; }
    else {
      const { report, incident } = await createReport({ phoneNumber: phone, issueType: issue, location: area, description: "Reported via support chat" });
      facts = `Report ${report.reportNumber} was recorded for ${area} (${issue}). ` + (incident ? `A related incident ${incident.incidentNumber} exists in this area, status ${say(incident.status)}.` : "No incident has been detected for this area yet.");
    }
  } else { escalated = true; fixed = "I'm not able to answer that. I've flagged your question for a support agent."; }

  const reply = fixed ?? (await complete(SYSTEM, `Customer: ${msg}\nFACTS: ${facts}`)) ?? facts ?? "Sorry, something went wrong.";
  await prisma.supportMessage.create({ data: { conversationId, phoneNumber: phone, role: "assistant", content: reply, intent, escalated } });
  return { reply, intent: intent.startsWith("AWAIT") ? "REPORT" : intent, escalated };
}

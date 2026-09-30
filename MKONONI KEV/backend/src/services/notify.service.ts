import { prisma } from "../db";
import { sendSMS } from "./africastalking/sms.service";

const TEMPLATES = {
  CONFIRMED: (n: string) => `MKONONI CONNECT: A network issue has been confirmed in your area. Our team has been notified. Incident: ${n}`,
  RESOLVED: (n: string) => `MKONONI CONNECT: The network issue in your area (Incident: ${n}) has been marked resolved. If problems continue, please report again.`,
};
/** SMS every distinct real reporter of the incident. Demo incidents never send SMS. */
export async function notifyIncident(inc: { id: string; incidentNumber: string; isDemo: boolean }, kind: keyof typeof TEMPLATES) {
  if (inc.isDemo) return { attempted: 0, sent: 0, failed: 0, note: "demo incident: no SMS sent" };
  const rows = await prisma.networkReport.findMany({ where: { incidentId: inc.id, isDemo: false }, distinct: ["phoneNumber"], select: { phoneNumber: true } });
  const out = await Promise.allSettled(rows.map((r) => sendSMS(r.phoneNumber, TEMPLATES[kind](inc.incidentNumber), inc.id)));
  const sent = out.filter((o) => o.status === "fulfilled" && o.value.status === "SENT").length;
  return { attempted: rows.length, sent, failed: rows.length - sent };
}

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { auth } from "../middleware/auth";
import { wrap, audit } from "../utils/http";
import { emit } from "../realtime";
import { cfg } from "../config";
import { createReport, ISSUES } from "../services/reports.service";
import { notifyIncident } from "../services/notify.service";
import { sendSMS } from "../services/africastalking/sms.service";
import { isValidKenyanPhone } from "../utils/phone";

const r = Router();
const staff = auth("NETWORK_OPERATOR", "SUPPORT_AGENT");
const ops = auth("NETWORK_OPERATOR");

r.get("/health", (_q, s) => s.json({ ok: true, africasTalking: cfg.atEnv === "sandbox" ? "SANDBOX" : "LIVE", ai: cfg.aiKey ? "enabled" : "disabled (using rule-based replies)" }));

r.post("/reports", auth(), wrap(async (q, s) => {
  const p = z.object({ phoneNumber: z.string().refine(isValidKenyanPhone, "Use +2547XXXXXXXX"), issueType: z.enum(ISSUES as [string, ...string[]]), location: z.string().min(2).max(60), description: z.string().max(160).optional() }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  if (q.user!.role === "CUSTOMER" && p.data.phoneNumber !== q.user!.phone) return s.status(403).json({ error: "customers can only report for their own number" });
  s.status(201).json(await createReport(p.data));
}));
r.get("/reports", auth(), wrap(async (q, s) => {
  if (q.user!.role === "FRAUD_ANALYST") return s.status(403).json({ error: "forbidden" });
  const where = q.user!.role === "CUSTOMER" ? { phoneNumber: q.user!.phone ?? "none" } : {};
  s.json(await prisma.networkReport.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }));
}));
r.get("/incidents", staff, wrap(async (_q, s) => s.json(await prisma.incident.findMany({ orderBy: { detectedAt: "desc" }, take: 100 }))));
r.post("/incidents/:id/confirm", ops, wrap(async (q, s) => {
  const found = await prisma.incident.findUnique({ where: { id: String(q.params.id) } });
  if (!found) return s.status(404).json({ error: "not found" });
  const inc = await prisma.incident.update({ where: { id: found.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  const sms = await notifyIncident(inc, "CONFIRMED");
  emit("incident:updated", inc); audit(q.user!.id, "INCIDENT_CONFIRMED", inc.incidentNumber);
  s.json({ incident: inc, sms });
}));
r.post("/incidents/:id/resolve", ops, wrap(async (q, s) => {
  const found = await prisma.incident.findUnique({ where: { id: String(q.params.id) } });
  if (!found) return s.status(404).json({ error: "not found" });
  const inc = await prisma.incident.update({ where: { id: found.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  const sms = await notifyIncident(inc, "RESOLVED");
  emit("incident:updated", inc); audit(q.user!.id, "INCIDENT_RESOLVED", inc.incidentNumber);
  s.json({ incident: inc, sms });
}));
r.post("/demo/simulate", ops, wrap(async (q, s) => { // isDemo=true, fake numbers, never SMS'd
  let last;
  for (let i = 0; i < cfg.threshold; i++)
    last = await createReport({ phoneNumber: `+254700000${100 + i}`, issueType: "No Network", location: "Kitui", description: "DEMO REPORT (simulated)", isDemo: true });
  audit(q.user!.id, "DEMO_SIMULATE");
  s.json({ demo: true, incident: last?.incident });
}));

r.post("/notifications/sms", auth("SUPPORT_AGENT"), wrap(async (q, s) => {
  const p = z.object({ phoneNumber: z.string().refine(isValidKenyanPhone, "Use +2547XXXXXXXX"), message: z.string().min(1).max(320) }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  const m = await sendSMS(p.data.phoneNumber, p.data.message);
  audit(q.user!.id, "SMS_SENT", m.id);
  s.status(m.status === "SENT" ? 200 : 502).json(m);
}));
r.get("/sms", staff, wrap(async (_q, s) => s.json(await prisma.smsMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))));
r.get("/ussd/sessions", staff, wrap(async (_q, s) => s.json(await prisma.ussdSession.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))));
r.get("/calls", staff, wrap(async (_q, s) => s.json(await prisma.call.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))));

r.get("/analytics", staff, wrap(async (_q, s) => {
  const [activeIncidents, openReports, fraudReports, ussdSessions, sms, recent, areas] = await Promise.all([
    prisma.incident.count({ where: { isDemo: false, status: { in: ["POSSIBLE_OUTAGE", "CONFIRMED"] } } }),
    prisma.networkReport.count({ where: { isDemo: false, status: { in: ["REPORTED", "INVESTIGATING"] } } }),
    prisma.fraudReport.count(), prisma.ussdSession.count(),
    prisma.smsMessage.groupBy({ by: ["status"], _count: true }),
    prisma.networkReport.findMany({ where: { isDemo: false, createdAt: { gte: new Date(Date.now() - 86400000) } }, select: { createdAt: true } }),
    prisma.networkReport.groupBy({ by: ["area"], where: { isDemo: false }, _count: true, orderBy: { _count: { area: "desc" } }, take: 10 }),
  ]);
  const smsByStatus = Object.fromEntries(sms.map((x) => [x.status, x._count]));
  const attempted = (smsByStatus.SENT ?? 0) + (smsByStatus.DELIVERED ?? 0) + (smsByStatus.FAILED ?? 0);
  const reportsByHour = Array(24).fill(0); recent.forEach((x) => reportsByHour[x.createdAt.getHours()]++);
  s.json({ activeIncidents, openReports, fraudReports, ussdSessions, smsByStatus, smsDeliveryRate: attempted ? (smsByStatus.DELIVERED ?? 0) / attempted : null,
    reportsByHour, reportsByArea: areas.map((a) => ({ area: a.area, count: a._count })) });
}));
export default r;

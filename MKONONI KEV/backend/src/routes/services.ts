import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../db";
import { auth } from "../middleware/auth";
import { wrap, audit } from "../utils/http";
import { isValidKenyanPhone } from "../utils/phone";
import { FRAUD_CATEGORIES } from "../services/fraud.rules";
import { createFraudReport } from "../services/fraud.service";
import { chat } from "../services/support.service";
import { sendAirtime } from "../services/africastalking/airtime.service";
import { DEMO_PACKAGES, purchaseData } from "../services/africastalking/mobile-data.service";

const r = Router();
const phone = z.string().refine(isValidKenyanPhone, "Use +2547XXXXXXXX");

r.post("/fraud", auth(), wrap(async (q, s) => {
  const p = z.object({ phoneNumber: phone, category: z.enum(FRAUD_CATEGORIES), description: z.string().max(300).optional() }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  if (q.user!.role === "CUSTOMER" && p.data.phoneNumber !== q.user!.phone) return s.status(403).json({ error: "customers can only report for their own number" });
  s.status(201).json(await createFraudReport(p.data));
}));
// Note: these are customer-reported indicators, not verified operator fraud events.
r.get("/fraud", auth("FRAUD_ANALYST"), wrap(async (q, s) => { audit(q.user!.id, "FRAUD_LIST"); s.json(await prisma.fraudReport.findMany({ orderBy: { createdAt: "desc" }, take: 200 })); }));

r.post("/support/chat", auth(), wrap(async (q, s) => {
  const p = z.object({ message: z.string().min(1).max(500), conversationId: z.string().max(60).optional() }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  const id = p.data.conversationId ?? randomUUID();
  s.json({ conversationId: id, ...(await chat(q.user!.phone, p.data.message, id)) });
}));
r.get("/support/escalations", auth("SUPPORT_AGENT"), wrap(async (_q, s) => s.json(await prisma.supportMessage.findMany({ where: { escalated: true }, orderBy: { createdAt: "desc" }, take: 100 }))));

r.post("/airtime/send", auth(), wrap(async (q, s) => {
  if (q.user!.role === "CUSTOMER") return s.status(403).json({ error: "forbidden" });
  const p = z.object({ phoneNumber: phone, amount: z.number() }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  try {
    const t = await sendAirtime(p.data.phoneNumber, p.data.amount);
    audit(q.user!.id, "AIRTIME", t.id);
    s.status(t.status === "SENT" ? 200 : 502).json(t);
  } catch (e) { s.status(400).json({ error: (e as Error).message }); }
}));
r.get("/airtime", auth("SUPPORT_AGENT"), wrap(async (_q, s) => s.json(await prisma.airtimeTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))));
r.get("/data/packages", auth(), (_q, s) => s.json({ demoPricing: true, packages: DEMO_PACKAGES }));
r.post("/data/purchase", auth(), wrap(async (q, s) => {
  if (q.user!.role === "CUSTOMER") return s.status(403).json({ error: "forbidden" });
  const p = z.object({ phoneNumber: phone, packageCode: z.string().max(20) }).safeParse(q.body);
  if (!p.success) return s.status(400).json({ error: p.error.flatten() });
  try {
    const t = await purchaseData(p.data.phoneNumber, p.data.packageCode);
    audit(q.user!.id, "DATA_PURCHASE", t.id);
    s.status(t.status === "QUEUED" ? 202 : 502).json(t);
  } catch (e) { s.status(400).json({ error: (e as Error).message }); }
}));
export default r;
